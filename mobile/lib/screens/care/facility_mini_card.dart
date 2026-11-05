import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../ui/building.dart';
import '../../ui/icons.dart';

/// A facility as a compact card (Home "Near you", the map): its building, name, distance,
/// open or closed, and the queue right now.
class FacilityMiniCard extends StatelessWidget {
  const FacilityMiniCard({super.key, required this.facility, this.onTap});

  final FacilitySummary facility;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final f = facility;
    final wait = f.waitRange == null ? null : fmt.waitRange(f.waitRange!.min, f.waitRange!.max, s);
    return SoftCard(
      onTap: onTap ?? () => context.go('/care/${f.slug}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                FacilityBuilding(type: f.type, emergency: f.emergency),
                Positioned(left: Space.md, top: Space.md, child: OpenBadge(open: f.openNow)),
                if (f.distanceKm != null)
                  Positioned(
                    right: Space.md,
                    top: Space.md,
                    child: _Glass(
                      child: Text(
                        '${f.distanceKm!.toStringAsFixed(1)} km',
                        style: theme.textTheme.labelSmall?.copyWith(color: Palette.forest),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.lg, Space.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(f.name, style: theme.textTheme.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(f.place, style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: Space.sm),
                Row(
                  children: [
                    Icon(PhosphorIconsRegular.usersThree,
                        size: 16, color: f.waiting == null ? Palette.muted : Palette.ochreText),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        f.waiting == null
                            ? '—'
                            : [
                                '${f.waiting} ${s.waiting}',
                                if (wait != null) '~$wait',
                              ].join(' · '),
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: f.waiting == null ? Palette.muted : Palette.ochreText,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Open or closed, readable on the drawing: a white pill with a coloured dot.
class OpenBadge extends StatelessWidget {
  const OpenBadge({super.key, required this.open});

  final bool open;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return _Glass(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: open ? Palette.brand : Palette.muted, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            open ? s.openNow : s.closed,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(color: open ? Palette.forest : Palette.muted),
          ),
        ],
      ),
    );
  }
}

class _Glass extends StatelessWidget {
  const _Glass({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.94),
          borderRadius: BorderRadius.circular(99),
          boxShadow: [BoxShadow(color: Palette.forest.withValues(alpha: 0.10), blurRadius: 6, offset: const Offset(0, 2))],
        ),
        child: child,
      );
}
