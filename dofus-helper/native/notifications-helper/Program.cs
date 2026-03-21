using System.Text.Json;
using System.IO;
using System.Reflection;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace NotificationReader;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        NotificationRuntime.Initialize();
        return RunAsync(args).GetAwaiter().GetResult();
    }

    private static async Task<int> RunAsync(string[] args)
    {
        var command = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "watch";
        var intervalMs = ParseInterval(args.Skip(1).FirstOrDefault()) ?? NotificationConstants.DefaultPollIntervalMs;

        return command switch
        {
            "snapshot" => await RunSnapshotAsync(),
            "watch" or "poll" => await RunWatchAsync(intervalMs),
            _ => await RunSnapshotAsync(),
        };
    }

    private static async Task<int> RunSnapshotAsync()
    {
        var snapshot = await ReadOnStaThreadAsync(NotificationReaderService.ReadSnapshotAsync);
        await WriteSnapshotAsync(snapshot);
        return 0;
    }

    private static async Task<int> RunWatchAsync(int intervalMs)
    {
        using var cancellation = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cancellation.Cancel();
        };

        while (!cancellation.IsCancellationRequested)
        {
            var snapshot = await ReadOnStaThreadAsync(NotificationReaderService.ReadSnapshotAsync);
            await WriteSnapshotAsync(snapshot);

            try
            {
                await Task.Delay(intervalMs, cancellation.Token);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }

        return 0;
    }

    private static async Task<NotificationSnapshot> ReadOnStaThreadAsync(Func<Task<NotificationSnapshot>> operation)
    {
        var completion = new TaskCompletionSource<NotificationSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);

        var thread = new Thread(() =>
        {
            try
            {
                var snapshot = operation().GetAwaiter().GetResult();
                completion.TrySetResult(snapshot);
            }
            catch (Exception ex)
            {
                NotificationRuntime.Logger.Error($"reader failed: {ex}");
                completion.TrySetResult(NotificationSnapshot.Unavailable(ex.GetType().Name, ex.Message));
            }
        })
        {
            IsBackground = true,
            Name = "NotificationReader.STA",
        };

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();

        return await completion.Task;
    }

    private static async Task WriteSnapshotAsync(NotificationSnapshot snapshot)
    {
        var json = JsonSerializer.Serialize(snapshot, NotificationRuntime.JsonOptions);
        Console.WriteLine(json);
        await Console.Out.FlushAsync();
    }

    private static int? ParseInterval(string? value)
    {
        if (int.TryParse(value, out var parsed) && parsed >= 500)
        {
            return parsed;
        }

        return null;
    }
}

internal static class NotificationReaderService
{
    private static readonly MethodInfo? AsTaskGenericMethod = typeof(WindowsRuntimeSystemExtensions)
        .GetMethods(BindingFlags.Public | BindingFlags.Static)
        .FirstOrDefault((method) =>
            method.Name == "AsTask" &&
            method.IsGenericMethodDefinition &&
            method.GetGenericArguments().Length == 1 &&
            method.GetParameters().Length == 1);

    public static async Task<NotificationSnapshot> ReadSnapshotAsync()
    {
        try
        {
            var listener = UserNotificationListener.Current;
            NotificationRuntime.Logger.Info("requesting notification access");

            var accessOperation = listener.GetType().GetMethod("RequestAccessAsync")?.Invoke(listener, null)
                ?? throw new InvalidOperationException("RequestAccessAsync introuvable.");
            var access = (UserNotificationListenerAccessStatus)(await AwaitWinRtAsync(accessOperation).ConfigureAwait(true)
                ?? throw new InvalidOperationException("RequestAccessAsync a retourne null."));
            var accessLabel = access.ToString();
            NotificationRuntime.Logger.Info($"notification access={accessLabel}");

            if (access != UserNotificationListenerAccessStatus.Allowed)
            {
                return NotificationSnapshot.AccessState(accessLabel, []);
            }

            var notificationsOperation = listener.GetType()
                .GetMethod("GetNotificationsAsync", [typeof(NotificationKinds)])?
                .Invoke(listener, [NotificationKinds.Toast])
                ?? throw new InvalidOperationException("GetNotificationsAsync introuvable.");
            var notificationsResult = await AwaitWinRtAsync(notificationsOperation).ConfigureAwait(true);
            var entries = new List<NotificationEntry>();

            foreach (var notification in EnumerateNotifications(notificationsResult))
            {
                var entry = TryMapNotification(notification);
                if (entry is null)
                {
                    continue;
                }

                entries.Add(entry);
                NotificationRuntime.Logger.Debug(
                    $"notification id={entry.Id} app={entry.App} createdAt={entry.CreatedAt} text={string.Join(" || ", entry.Text)}");
            }

            NotificationRuntime.Logger.Info($"notification count={entries.Count}");
            return NotificationSnapshot.AccessState(accessLabel, entries);
        }
        catch (Exception ex)
        {
            NotificationRuntime.Logger.Error($"notification read failed: {ex}");
            return NotificationSnapshot.Unavailable(ex.GetType().Name, ex.Message);
        }
    }

    private static IEnumerable<UserNotification> EnumerateNotifications(object? value)
    {
        if (value is System.Collections.IEnumerable sequence)
        {
            foreach (var item in sequence)
            {
                if (item is UserNotification notification)
                {
                    yield return notification;
                }
            }
        }
    }

    private static async Task<object?> AwaitWinRtAsync(object asyncOperation)
    {
        if (AsTaskGenericMethod is null)
        {
            throw new InvalidOperationException("AsTask<T>() introuvable.");
        }

        var asyncInterface = asyncOperation.GetType().GetInterfaces()
            .FirstOrDefault((iface) =>
                iface.IsGenericType &&
                iface.FullName is string fullName &&
                fullName.StartsWith("Windows.Foundation.IAsyncOperation`1", StringComparison.Ordinal));

        if (asyncInterface is null)
        {
            throw new InvalidOperationException($"Type async WinRT non supporte: {asyncOperation.GetType().FullName}");
        }

        var resultType = asyncInterface.GetGenericArguments()[0];
        var asTaskMethod = AsTaskGenericMethod.MakeGenericMethod(resultType);
        var task = (Task?)asTaskMethod.Invoke(null, [asyncOperation])
            ?? throw new InvalidOperationException("Conversion WinRT -> Task impossible.");

        await task.ConfigureAwait(true);
        return task.GetType().GetProperty("Result")?.GetValue(task);
    }

    private static NotificationEntry? TryMapNotification(UserNotification notification)
    {
        try
        {
            var visual = notification.Notification?.Visual;
            if (visual is null)
            {
                return null;
            }

            NotificationBinding? binding = visual.GetBinding(KnownNotificationBindings.ToastGeneric);
            if (binding is null)
            {
                return null;
            }

            var text = binding.GetTextElements()
                .Select((element) => NormalizeText(element.Text))
                .Where((value) => !string.IsNullOrWhiteSpace(value))
                .ToArray();

            if (text.Length == 0)
            {
                return null;
            }

            return new NotificationEntry(
                notification.Id,
                notification.AppInfo?.DisplayInfo?.DisplayName ?? string.Empty,
                notification.CreationTime.ToString("O"),
                text);
        }
        catch (Exception ex)
        {
            NotificationRuntime.Logger.Error($"notification mapping failed: {ex}");
            return null;
        }
    }

    private static string NormalizeText(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Replace("\r", " ").Replace("\n", " ").Trim();
}

internal static class NotificationRuntime
{
    public static JsonSerializerOptions JsonOptions { get; private set; } = new(JsonSerializerDefaults.Web);
    public static FileLogger Logger { get; private set; } = FileLogger.Disabled;

    public static void Initialize()
    {
        JsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

        var logPath = Environment.GetEnvironmentVariable("DOFUS_HELPER_NOTIFICATIONS_LOG_PATH")?.Trim();
        var debugEnabled = string.Equals(
            Environment.GetEnvironmentVariable("DOFUS_HELPER_NOTIFICATIONS_DEBUG")?.Trim(),
            "1",
            StringComparison.OrdinalIgnoreCase);

        Logger = FileLogger.Create(logPath, debugEnabled);
        Logger.Info($"runtime initialized debug={debugEnabled}");
    }
}

internal sealed class FileLogger
{
    private static readonly object Sync = new();
    public static FileLogger Disabled { get; } = new(null, false);

    private readonly string? _path;
    private readonly bool _debugEnabled;

    private FileLogger(string? path, bool debugEnabled)
    {
        _path = path;
        _debugEnabled = debugEnabled;
    }

    public static FileLogger Create(string? path, bool debugEnabled)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Disabled;
        }

        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [info] logger started{Environment.NewLine}");
            return new FileLogger(path, debugEnabled);
        }
        catch
        {
            return Disabled;
        }
    }

    public void Info(string message) => Write("info", message);
    public void Error(string message) => Write("error", message);

    public void Debug(string message)
    {
        if (_debugEnabled)
        {
            Write("debug", message);
        }
    }

    private void Write(string level, string message)
    {
        if (string.IsNullOrWhiteSpace(_path))
        {
            return;
        }

        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}{Environment.NewLine}";
        lock (Sync)
        {
            try
            {
                File.AppendAllText(_path, line);
            }
            catch
            {
                // Ignore logging failures.
            }
        }
    }
}

internal static class NotificationConstants
{
    public const int DefaultPollIntervalMs = 1500;
}

internal sealed record NotificationEntry(
    long Id,
    string App,
    string CreatedAt,
    string[] Text
);

internal sealed record NotificationSnapshot(
    string Access,
    NotificationEntry[] Notifications,
    string? Error
)
{
    public static NotificationSnapshot AccessState(string access, IEnumerable<NotificationEntry> notifications) =>
        new(access, notifications.ToArray(), null);

    public static NotificationSnapshot Unavailable(string reason, string message) =>
        new($"Unavailable:{reason}", [], message);
}
