import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app/theme.dart';
import 'icons.dart';

/// A small muted label above a group or a section.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.action, this.onAction, this.padding});

  final String text;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600);
    return Padding(
      padding: padding ?? const EdgeInsets.fromLTRB(Space.lg, 0, Space.xs, Space.xs),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 32),
        child: Row(
          children: [
            Expanded(child: Text(text, style: style)),
            if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
          ],
        ),
      ),
    );
  }
}

/// Inset grouped list: a muted label above one white rounded group (card depth, no shadow),
/// rows split by hairlines that start where the row text starts.
class GroupedSection extends StatelessWidget {
  const GroupedSection({
    super.key,
    this.label,
    this.action,
    this.onAction,
    required this.children,
    this.footer,
    this.inset = GroupedSection.iconInset,
    this.margin = const EdgeInsets.only(bottom: Space.xl),
  });

  /// Where the hairline starts under a row with a leading icon.
  static const iconInset = Space.lg + 24 + Space.lg;

  final String? label;
  final String? action;
  final VoidCallback? onAction;
  final List<Widget> children;
  final String? footer;
  final double inset;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    final rows = children.where((w) => w is! SizedBox || w.child != null).toList();
    return Padding(
      padding: margin,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (label != null) SectionLabel(label!, action: action, onAction: onAction),
          DecoratedBox(
            decoration: BoxDecoration(
              color: Palette.surface,
              borderRadius: BorderRadius.circular(Space.radiusLg),
              border: Border.all(color: Palette.hairline),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(Space.radiusLg - 1),
              child: Material(
                type: MaterialType.transparency,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (i, row) in rows.indexed) ...[
                      if (i > 0) Divider(height: 1, indent: inset),
                      row,
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, 0),
              child: Text(footer!, style: Theme.of(context).textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}

/// One row of a [GroupedSection]: icon, title (two lines at most), optional subtitle, and a
/// trailing widget or, for a navigation row, a chevron. At least [Space.row] tall.
class GroupedRow extends StatelessWidget {
  const GroupedRow({
    super.key,
    this.icon,
    this.leading,
    required this.title,
    this.subtitle,
    this.trailing,
    this.action,
    this.onTap,
    this.onLongPress,
    this.chevron,
    this.danger = false,
    this.enabled = true,
    this.iconColor,
  });

  final IconData? icon;
  final Widget? leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// A text button ("Stop sharing"): on the right, or under the text when the text is large.
  final Widget? action;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Defaults to true for a tappable row without a trailing widget.
  final bool? chevron;
  final bool danger;

  /// A row that cannot change right now: muted text and icon.
  final bool enabled;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = danger ? Palette.danger : (enabled ? Palette.ink : Palette.muted);
    final showChevron = chevron ?? (onTap != null && trailing == null && action == null);
    final lead = leading ?? (icon == null ? null : Icon(icon, size: 22, color: danger ? Palette.danger : (enabled ? (iconColor ?? Palette.brand) : Palette.muted)));
    final actionBelow = action != null && context.largeText;
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Space.row),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: Space.lg)]
              else if (lead != null) ...[SizedBox(width: 24, child: Center(child: lead)), const SizedBox(width: Space.lg)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(color: color),
                      maxLines: context.largeText ? 3 : 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(subtitle!, style: theme.textTheme.bodySmall),
                    ],
                    if (actionBelow) Transform.translate(offset: const Offset(-Space.sm, 0), child: action!),
                  ],
                ),
              ),
              if (action != null && !actionBelow) ...[const SizedBox(width: Space.sm), action!],
              if (trailing != null) ...[const SizedBox(width: Space.md), trailing!],
              if (showChevron) ...[
                const SizedBox(width: Space.sm),
                Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.muted),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Initials in a mint circle, one size everywhere (no faces for doctors, upgrade 05 §3).
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.size = Avatar.medium, this.initials});

  static const medium = 40.0;

  final String name;
  final double size;

  /// Overrides the initials worked out from [name].
  final String? initials;

  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: Palette.brandSubtle, shape: BoxShape.circle),
          child: Text(
            initials ?? initialsOf(name),
            style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Palette.brand, fontWeight: FontWeight.w700),
          ),
        ),
      );
}

/// A row with a switch; tapping anywhere on the row toggles it.
class GroupedSwitchRow extends StatelessWidget {
  const GroupedSwitchRow({
    super.key,
    this.icon,
    required this.title,
    this.subtitle,
    required this.value,
    required this.onChanged,
    this.locked = false,
  });

  final IconData? icon;
  final String title;
  final String? subtitle;
  final bool value;

  /// Null while it cannot change for a moment (saving).
  final ValueChanged<bool>? onChanged;

  /// It can never change here: the row is muted.
  final bool locked;

  void _toggle(bool on) {
    HapticFeedback.selectionClick();
    onChanged!(on);
  }

  @override
  Widget build(BuildContext context) => MergeSemantics(
        child: GroupedRow(
          icon: icon,
          title: title,
          subtitle: subtitle,
          enabled: !locked,
          onTap: onChanged == null ? null : () => _toggle(!value),
          trailing: Switch(value: value, onChanged: onChanged == null ? null : _toggle),
        ),
      );
}
