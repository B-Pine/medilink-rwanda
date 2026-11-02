import { CaretDown, UserCircle } from "@phosphor-icons/react";

import { Badge } from "./Badge";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";

export interface SwitcherProfile {
  id: string;
  name: string;
  /** Localised relationship label, e.g. "You", "Your child", "Shared with you". */
  relationship: string;
}

export interface ProfileSwitcherProps {
  profiles: SwitcherProfile[];
  currentId: string | null;
  onSelect: (id: string) => void;
  /** Accessible name of the trigger, e.g. "Switch profile". */
  label: string;
}

/**
 * Menu of the profiles an account can act for, each with its relationship badge (sprint-03 §6.3,
 * design 07 §2). Keyboard and screen reader operable through the Radix menu; 48 px targets.
 */
export function ProfileSwitcher({ profiles, currentId, onSelect, label }: ProfileSwitcherProps) {
  const current = profiles.find((p) => p.id === currentId) ?? profiles[0];
  if (!current) return null;
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${label}: ${current.name}`}
        className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-full bg-surface px-3 text-body-sm text-fg shadow-card"
      >
        <UserCircle aria-hidden="true" size={22} className="shrink-0" />
        <span className="truncate font-medium whitespace-nowrap">{current.name}</span>
        <span className="hidden sm:inline">
          <Badge tone="neutral">{current.relationship}</Badge>
        </span>
        <CaretDown aria-hidden="true" />
      </MenuTrigger>
      <MenuContent align="start">
        {profiles.map((profile) => (
          <MenuItem
            key={profile.id}
            className="min-h-12"
            onSelect={() => onSelect(profile.id)}
            aria-current={profile.id === current.id || undefined}
          >
            <span className="flex-1">{profile.name}</span>
            <Badge tone={profile.id === current.id ? "brand" : "neutral"}>
              {profile.relationship}
            </Badge>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
