import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../ui/feedback.dart';
import '../../ui/heartbeat_refresh.dart';
import '../../ui/page_header.dart';
import '../home/home_screen.dart';
import 'booking_actions.dart';

/// Today (live tickets) · Upcoming · Past, with headers that stick while scrolling.
class VisitsScreen extends ConsumerWidget {
  const VisitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final active = ref.watch(activeVisitsProvider);
    final upcoming = ref.watch(bookingsProvider('upcoming'));
    final past = ref.watch(bookingsProvider('past'));
    final offline = [active.value?.offline, upcoming.value?.offline, past.value?.offline].contains(true);

    Future<void> refresh() async {
      ref
        ..invalidate(activeVisitsProvider)
        ..invalidate(bookingsProvider('upcoming'))
        ..invalidate(bookingsProvider('past'));
      await ref.read(bookingsProvider('upcoming').future).catchError((_) => const Cached(<Booking>[]));
    }

    final loading = active.isLoading && upcoming.isLoading;
    final error = active.error ?? upcoming.error;
    final tickets = active.value?.data ?? const <ActiveVisit>[];
    final next = upcoming.value?.data ?? const <Booking>[];
    final done = past.value?.data ?? const <Booking>[];

    return Scaffold(
      body: HeartbeatRefresh(
        onRefresh: refresh,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: BandHeader(title: s.visits)),
            if (offline) const SliverToBoxAdapter(child: OfflineBar()),
            if (loading)
              const SliverPadding(
                padding: EdgeInsets.all(Space.lg),
                sliver: SliverToBoxAdapter(child: SkeletonList()),
              )
            else if (error != null && tickets.isEmpty && next.isEmpty)
              SliverToBoxAdapter(child: ErrorState(error: error, onRetry: refresh))
            else if (tickets.isEmpty && next.isEmpty && done.isEmpty)
              SliverToBoxAdapter(
                child: EmptyState(
                  icon: PhosphorIconsRegular.ticket,
                  text: s.noVisits,
                  action: s.book,
                  onAction: () => context.go('/care'),
                ),
              )
            else ...[
              if (tickets.isNotEmpty) ...[
                _Header(s.today),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                  sliver: SliverList.separated(
                    itemCount: tickets.length,
                    separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                    itemBuilder: (context, i) => TicketCard(
                      visit: tickets[i],
                      onTap: () => context.go('/visits/ticket/${tickets[i].id}'),
                    ),
                  ),
                ),
              ],
              if (next.isNotEmpty) ...[
                _Header(s.upcoming),
                _BookingList(bookings: next, swipe: true),
              ],
              if (done.isNotEmpty) ...[
                _Header(s.past),
                _BookingList(bookings: done.take(20).toList(), swipe: false),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: Space.xxl)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => SliverPersistentHeader(pinned: true, delegate: _HeaderDelegate(text));
}

class _HeaderDelegate extends SliverPersistentHeaderDelegate {
  _HeaderDelegate(this.text);
  final String text;

  @override
  double get minExtent => 44;
  @override
  double get maxExtent => 44;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => Container(
        color: Palette.page,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: Space.lg + Space.xs),
        child: Text(
          text.toUpperCase(),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
        ),
      );

  @override
  bool shouldRebuild(_HeaderDelegate oldDelegate) => oldDelegate.text != text;
}

class _BookingList extends ConsumerWidget {
  const _BookingList({required this.bookings, required this.swipe});

  final List<Booking> bookings;
  final bool swipe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: Space.lg),
      sliver: SliverList.separated(
        itemCount: bookings.length,
        separatorBuilder: (_, _) => const SizedBox(height: Space.sm),
        itemBuilder: (context, i) {
          final b = bookings[i];
          final tile = GestureDetector(
            onLongPress: () => showBookingMenu(context, ref, b),
            child: BookingTile(booking: b),
          );
          if (!swipe || !b.canChange) return tile;
          // Swipe right: add to calendar. Swipe left: cancel (asks first).
          return Dismissible(
            key: ValueKey(b.id),
            background: _SwipeBg(
              color: Palette.brandSubtle,
              fg: Palette.brand,
              icon: PhosphorIconsRegular.calendarPlus,
              label: s.addToCalendar,
              alignment: Alignment.centerLeft,
            ),
            secondaryBackground: _SwipeBg(
              color: Palette.dangerSubtle,
              fg: Palette.danger,
              icon: PhosphorIconsRegular.xCircle,
              label: s.cancel,
              alignment: Alignment.centerRight,
            ),
            confirmDismiss: (direction) async {
              HapticFeedback.mediumImpact();
              if (direction == DismissDirection.startToEnd) {
                await addToCalendar(ref, b);
                return false;
              }
              await cancelBooking(context, ref, b);
              return false;
            },
            child: tile,
          );
        },
      ),
    );
  }
}

class _SwipeBg extends StatelessWidget {
  const _SwipeBg({
    required this.color,
    required this.fg,
    required this.icon,
    required this.label,
    required this.alignment,
  });

  final Color color, fg;
  final IconData icon;
  final String label;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) => Container(
        alignment: alignment,
        padding: const EdgeInsets.symmetric(horizontal: Space.xl),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(Space.radius)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: fg),
            const SizedBox(width: Space.sm),
            Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}
