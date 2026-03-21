import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveDataFile } from "./runtimePaths.js";

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface LinkGroup {
  id: string;
  name: string;
  collapsed: boolean;
  links: LinkItem[];
}

export interface LinksPayload {
  ok: boolean;
  links: LinkGroup[];
  message?: string;
}

const DEFAULT_LINK_GROUPS: LinkGroup[] = [
  {
    id: "unity",
    name: "Dofus Unity",
    collapsed: false,
    links: [
      { id: "unity-noobs", label: "Dofus Pour Les Noobs", url: "http://www.dofuspourlesnoobs.com/" },
      { id: "unity-db", label: "DofusDB", url: "https://dofusdb.fr/fr/" },
      { id: "unity-book", label: "Dofusbook", url: "https://www.dofusbook.net/fr/" },
      { id: "unity-dofensive", label: "Dofensive", url: "http://dofensive.com/fr" },
      { id: "unity-yelle", label: "DofusYelle", url: "https://dofusyelle.com" },
      { id: "unity-huz", label: "Huzounet", url: "https://huzounet.fr/equipments" },
    ],
  },
  {
    id: "retro",
    name: "Dofus Retro",
    collapsed: false,
    links: [
      { id: "retro-book", label: "Retro Dofusbook", url: "https://retro.dofusbook.net/fr/" },
      { id: "retro-solomonk", label: "Solomonk", url: "https://solomonk.fr/fr/" },
    ],
  },
];

function makeId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function cloneLinks(groups: LinkGroup[]): LinkGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    collapsed: group.collapsed,
    links: group.links.map((link) => ({ ...link })),
  }));
}

function normalizedLinkItem(value: unknown): LinkItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const label = String(candidate.label ?? "").trim();
  const url = String(candidate.url ?? "").trim();
  if (!label || !url) {
    return null;
  }

  const id = String(candidate.id ?? makeId("link")).trim() || makeId("link");
  return { id, label, url };
}

function normalizeLinkGroups(value: unknown): LinkGroup[] {
  if (value === null || value === undefined || value === "") {
    return cloneLinks(DEFAULT_LINK_GROUPS);
  }

  if (!Array.isArray(value)) {
    return cloneLinks(DEFAULT_LINK_GROUPS);
  }

  const groups: LinkGroup[] = [];
  for (const rawGroup of value) {
    if (typeof rawGroup !== "object" || rawGroup === null) {
      continue;
    }

    const candidate = rawGroup as Record<string, unknown>;
    const name = String(candidate.name ?? "").trim();
    if (!name) {
      continue;
    }

    const links = Array.isArray(candidate.links)
      ? candidate.links.map(normalizedLinkItem).filter((link): link is LinkItem => link !== null)
      : [];

    groups.push({
      id: String(candidate.id ?? makeId("group")).trim() || makeId("group"),
      name,
      collapsed: Boolean(candidate.collapsed),
      links,
    });
  }

  return groups.length ? groups : cloneLinks(DEFAULT_LINK_GROUPS);
}

function resolveStorageFilePath(): string {
  return resolveDataFile("links.json");
}

function readStoredGroups(): LinkGroup[] {
  const filePath = resolveStorageFilePath();
  if (!existsSync(filePath)) {
    return cloneLinks(DEFAULT_LINK_GROUPS);
  }

  try {
    const content = readFileSync(filePath, "utf8");
    return normalizeLinkGroups(JSON.parse(content));
  } catch {
    return cloneLinks(DEFAULT_LINK_GROUPS);
  }
}

function writeStoredGroups(groups: LinkGroup[]): LinkGroup[] {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = normalizeLinkGroups(groups);
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return cloneLinks(normalized);
}

function success(groups: LinkGroup[]): LinksPayload {
  return { ok: true, links: writeStoredGroups(groups) };
}

function failure(message: string): LinksPayload {
  return { ok: false, message, links: readStoredGroups() };
}

function findGroup(groups: LinkGroup[], groupId: string): LinkGroup | undefined {
  return groups.find((group) => group.id === groupId);
}

export const linksStorage = {
  list(): LinksPayload {
    return { ok: true, links: readStoredGroups() };
  },

  addGroup(name: string): LinksPayload {
    const groupName = String(name).trim();
    if (!groupName) {
      return failure("Nom de dossier invalide.");
    }

    const groups = readStoredGroups();
    groups.push({ id: makeId("group"), name: groupName, collapsed: false, links: [] });
    return success(groups);
  },

  renameGroup(groupId: string, name: string): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    const groupName = String(name).trim();
    if (!groupName) {
      return failure("Nom de dossier invalide.");
    }

    group.name = groupName;
    return success(groups);
  },

  deleteGroup(groupId: string): LinksPayload {
    const groups = readStoredGroups();
    const nextGroups = groups.filter((group) => group.id !== groupId);
    if (nextGroups.length === groups.length) {
      return failure("Dossier introuvable.");
    }
    return success(nextGroups);
  },

  saveGroupOrder(groupIds: string[]): LinksPayload {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return failure("Ordre de dossiers invalide.");
    }

    const groups = readStoredGroups();
    const byId = new Map(groups.map((group) => [group.id, group]));
    const ordered = groupIds.map((groupId) => byId.get(groupId)).filter((group): group is LinkGroup => Boolean(group));
    if (!ordered.length) {
      return failure("Ordre de dossiers invalide.");
    }

    const remaining = groups.filter((group) => !groupIds.includes(group.id));
    return success([...ordered, ...remaining]);
  },

  setGroupCollapsed(groupId: string, collapsed: boolean): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    group.collapsed = Boolean(collapsed);
    return success(groups);
  },

  addLink(groupId: string, label: string, url: string): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    const linkLabel = String(label).trim();
    const linkUrl = String(url).trim();
    if (!linkLabel || !linkUrl) {
      return failure("Lien invalide.");
    }

    group.links.push({ id: makeId("link"), label: linkLabel, url: linkUrl });
    return success(groups);
  },

  updateLink(groupId: string, linkId: string, label: string, url: string): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    const link = group.links.find((item) => item.id === linkId);
    if (!link) {
      return failure("Lien introuvable.");
    }

    const linkLabel = String(label).trim();
    const linkUrl = String(url).trim();
    if (!linkLabel || !linkUrl) {
      return failure("Lien invalide.");
    }

    link.label = linkLabel;
    link.url = linkUrl;
    return success(groups);
  },

  deleteLink(groupId: string, linkId: string): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    const nextLinks = group.links.filter((link) => link.id !== linkId);
    if (nextLinks.length === group.links.length) {
      return failure("Lien introuvable.");
    }

    group.links = nextLinks;
    return success(groups);
  },

  saveLinkOrder(groupId: string, linkIds: string[]): LinksPayload {
    const groups = readStoredGroups();
    const group = findGroup(groups, groupId);
    if (!group) {
      return failure("Dossier introuvable.");
    }

    const links = [...group.links];
    const byId = new Map(links.map((link) => [link.id, link]));
    const ordered = linkIds.map((linkId) => byId.get(linkId)).filter((link): link is LinkItem => Boolean(link));
    if (!ordered.length && links.length) {
      return failure("Ordre de liens invalide.");
    }

    const remaining = links.filter((link) => !linkIds.includes(link.id));
    group.links = [...ordered, ...remaining];
    return success(groups);
  },
};
