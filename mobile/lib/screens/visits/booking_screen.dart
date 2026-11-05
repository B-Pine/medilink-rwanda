import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/feedback.dart';
import '../care/directions.dart';
import 'booking_actions.dart';

/// One appointment: when, where, and the actions (calendar, directions, cancel).
class BookingScreen extends ConsumerWidget {
  const BookingScreen({super.key, required this.bookingId});

  final String bookingId;

  Booking? _find(WidgetRef ref) {
    for (final when in ['upcoming', 'past']) {
      final hit = ref.watch(bookingsProvider(when)).value?.data.where((b) => b.id == bookingId).firstOrNull;
      if (hit != null) return hit;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final booking = _find(ref);
    final loading = ref.watch(bookingsProvider('upcoming')).isLoading;
    return Scaffold(
      appBar: AppBar(title: Text(booking?.code ?? '')),
      body: booking == null
          ? (loading
              ? const Padding(padding: EdgeInsets.all(Space.lg), child: SkeletonList(count: 2))
              : EmptyState(icon: PhosphorIconsRegular.calendarX, text: s.empty))
          : ListView(
              padding: const EdgeInsets.all(Space.lg),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(Space.xl),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        StatusPill(
                          text: s.state(booking.status),
                          tone: booking.status == 'confirmed' ? PillTone.brand : PillTone.muted,
                        ),
                        const SizedBox(height: Space.md),
                        Text(fmt.day(booking.startsAt, s), style: theme.textTheme.titleLarge),
                        Text(
                          fmt.time(booking.startsAt),
                          style: theme.textTheme.displayMedium?.copyWith(color: Palette.brand),
                        ),
                        const SizedBox(height: Space.lg),
                        const Divider(),
                        const SizedBox(height: Space.md),
                        _Line(icon: PhosphorIconsRegular.buildings, text: booking.facilityName),
                        _Line(icon: PhosphorIconsRegular.stethoscope, text: s.pick(booking.service)),
                        if (booking.doctor != null) _Line(icon: PhosphorIconsRegular.userCircle, text: booking.doctor!),
                        _Line(icon: PhosphorIconsRegular.user, text: booking.patientName),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: Space.xl),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => addToCalendar(ref, booking),
                        icon: const Icon(PhosphorIconsRegular.calendarPlus, size: 20),
                        label: Text(s.addToCalendar, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => openDirections(name: booking.facilityName),
                        icon: const Icon(PhosphorIconsRegular.navigationArrow, size: 20),
                        label: Text(s.directions),
                      ),
                    ),
                  ],
                ),
                if (booking.canChange) ...[
                  const SizedBox(height: Space.md),
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: Palette.danger),
                    onPressed: () async {
                      if (await cancelBooking(context, ref, booking) && context.mounted) context.go('/visits');
                    },
                    icon: const Icon(PhosphorIconsRegular.xCircle),
                    label: Text(s.cancel),
                  ),
                ],
              ],
            ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => text.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              Icon(icon, size: 20, color: Palette.muted),
              const SizedBox(width: Space.md),
              Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyLarge)),
            ],
          ),
        );
}
