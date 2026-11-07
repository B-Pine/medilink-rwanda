import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../care/directions.dart';

/// Opens the appointment as a new calendar event (Google Calendar template).
Future<void> addToCalendar(WidgetRef ref, Booking booking) async {
  final start = booking.startsAt.toUtc();
  final end = (booking.endsAt ?? booking.startsAt.add(const Duration(minutes: 30))).toUtc();
  String stamp(DateTime d) =>
      '${d.toIso8601String().replaceAll(RegExp(r'[-:]'), '').split('.').first}Z';
  // A Google Calendar template works on every Android phone without an extra permission.
  final uri = Uri.https('calendar.google.com', '/calendar/render', {
    'action': 'TEMPLATE',
    'text': 'MediLink · ${booking.facilityName}',
    'dates': '${stamp(start)}/${stamp(end)}',
    'details': booking.code,
    'location': booking.facilityName,
  });
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// Cancels after asking (red, cannot be undone). Returns true when cancelled.
Future<bool> cancelBooking(BuildContext context, WidgetRef ref, Booking booking) async {
  final s = S.of(context);
  if (!await confirmDanger(context, title: s.cancelBooking, action: s.cancel)) return false;
  try {
    await ref.read(apiProvider).post('/api/v1/patient/bookings/${booking.id}/cancel/', {'version': booking.version});
    HapticFeedback.lightImpact();
    ref
      ..invalidate(bookingsProvider('upcoming'))
      ..invalidate(bookingsProvider('past'));
    return true;
  } on ApiException catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : s.somethingWrong)),
      );
    }
    return false;
  }
}

/// Long-press menu on an appointment (upgrade 15 §3); every item also exists on its page.
Future<void> showBookingMenu(BuildContext context, WidgetRef ref, Booking booking) async {
  final s = S.of(context);
  HapticFeedback.mediumImpact();
  final choice = await showModalBottomSheet<String>(
    context: context,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(PhosphorIconsRegular.calendarPlus),
            title: Text(s.addToCalendar),
            onTap: () => Navigator.pop(context, 'calendar'),
          ),
          ListTile(
            leading: const Icon(PhosphorIconsRegular.navigationArrow),
            title: Text(s.directions),
            onTap: () => Navigator.pop(context, 'directions'),
          ),
          ListTile(
            leading: const Icon(PhosphorIconsRegular.buildings),
            title: Text(booking.facilityName),
            onTap: () => Navigator.pop(context, 'facility'),
          ),
          if (booking.canChange)
            ListTile(
              leading: Icon(PhosphorIconsRegular.xCircle, color: Palette.danger),
              title: Text(s.cancel, style: TextStyle(color: Palette.danger)),
              onTap: () => Navigator.pop(context, 'cancel'),
            ),
        ],
      ),
    ),
  );
  if (!context.mounted) return;
  switch (choice) {
    case 'calendar':
      await addToCalendar(ref, booking);
    case 'directions':
      await openDirections(name: booking.facilityName);
    case 'facility':
      context.go('/care/${booking.facilitySlug}');
    case 'cancel':
      await cancelBooking(context, ref, booking);
  }
}
