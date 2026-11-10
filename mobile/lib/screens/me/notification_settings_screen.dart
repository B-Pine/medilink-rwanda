import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/profile.dart';
import '../../data/session.dart';
import '../../ui/controls.dart';
import '../../ui/feedback.dart';
import '../../ui/grouped.dart';
import '../../ui/icons.dart';
import '../../ui/sub_page.dart';

/// How and when messages arrive (same settings as the website): channels per level, quiet hours,
/// visit reminders and alerts for family members. Each change saves at once.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() => _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState extends ConsumerState<NotificationSettingsScreen> {
  bool _saving = false;

  static const _reminderChoices = [60, 120, 1440, 2880];

  Future<void> _save(NotificationPrefs prefs, Json change) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(apiProvider)
          .patch('/api/v1/patient/notification-preferences/', {'version': prefs.version, ...change});
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong)),
        );
      }
    } finally {
      ref.invalidate(notificationPrefsProvider);
      if (mounted) setState(() => _saving = false);
    }
  }

  String _reminderLabel(int minutes, Strings s) =>
      minutes >= 1440 ? '${minutes ~/ 1440} ${s.t('daysBefore')}' : '${minutes ~/ 60} ${s.t('hoursBefore')}';

  Future<void> _pickQuiet(NotificationPrefs p, String edge) async {
    final current = edge == 'start' ? p.quietStart : p.quietEnd;
    final parts = current.split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.tryParse(parts.first) ?? 21, minute: int.tryParse(parts.last) ?? 0),
    );
    if (picked == null) return;
    final value = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
    await _save(p, {
      'quiet_hours': {
        'is_enabled': true,
        'start': edge == 'start' ? value : p.quietStart,
        'end': edge == 'end' ? value : p.quietEnd,
      },
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final prefs = ref.watch(notificationPrefsProvider);
    return SubPage(
      title: s.t('notificationSettings'),
      busy: _saving,
      children: prefs.when(
        loading: () => const [SkeletonList(count: 4)],
        error: (e, _) => [ErrorState(error: e, onRetry: () => ref.invalidate(notificationPrefsProvider))],
        data: (p) => [
          for (final level in const ['critical', 'important', 'routine'])
            GroupedSection(
              label: s.t('level_$level'),
              footer: s.t('level_${level}_hint'),
              children: [
                for (final channel in p.available)
                  GroupedSwitchRow(
                    icon: _icon(channel),
                    title: s.t('channel_$channel'),
                    value: (p.channels[level] ?? const []).contains(channel),
                    locked: level == 'critical' && channel == 'in_app',
                    onChanged: (level == 'critical' && channel == 'in_app') || _saving
                        ? null
                        : (on) {
                            final next = {for (final e in p.channels.entries) e.key: [...e.value]};
                            final list = next[level] ??= [];
                            on ? list.add(channel) : list.remove(channel);
                            _save(p, {'channels': next});
                          },
                  ),
              ],
            ),
          GroupedSection(
            label: s.t('quietHours'),
            footer: s.t('quietHoursNote'),
            children: [
              GroupedSwitchRow(
                icon: PhosphorIconsRegular.clock,
                title: s.t('quietHoursOn'),
                subtitle: '${p.quietStart} – ${p.quietEnd}',
                value: p.quietOn,
                onChanged: _saving
                    ? null
                    : (on) => _save(p, {
                          'quiet_hours': {'is_enabled': on, 'start': p.quietStart, 'end': p.quietEnd},
                        }),
              ),
              if (p.quietOn)
                Padding(
                  padding: const EdgeInsets.all(Space.lg),
                  child: Row(
                    children: [
                      for (final (i, edge) in const ['start', 'end'].indexed) ...[
                        if (i > 0) const SizedBox(width: Space.md),
                        Expanded(
                          child: FieldButton(
                            label: s.t('quiet_$edge'),
                            value: edge == 'start' ? p.quietStart : p.quietEnd,
                            icon: PhosphorIconsRegular.clock,
                            onTap: _saving ? null : () => _pickQuiet(p, edge),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
          SectionLabel(s.t('visitReminders')),
          Padding(
            padding: const EdgeInsets.only(bottom: Space.xl),
            child: Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              children: [
                for (final minutes in {..._reminderChoices, ...p.reminders}.toList()..sort())
                  FilterChip(
                    label: Text(_reminderLabel(minutes, s)),
                    selected: p.reminders.contains(minutes),
                    showCheckmark: false,
                    labelStyle: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: p.reminders.contains(minutes) ? Palette.onBrand : Palette.ink,
                          fontWeight: FontWeight.w600,
                        ),
                    onSelected: _saving
                        ? null
                        : (on) {
                            HapticFeedback.selectionClick();
                            final next = [...p.reminders];
                            on ? next.add(minutes) : next.remove(minutes);
                            if (next.length <= 5) _save(p, {'reminder_offsets_minutes': next..sort()});
                          },
                  ),
              ],
            ),
          ),
          if (p.dependents.isNotEmpty)
            GroupedSection(
              label: s.t('familyAlerts'),
              children: [
                for (final d in p.dependents)
                  GroupedSwitchRow(
                    icon: PhosphorIconsRegular.usersThree,
                    title: '${d['display_name'] ?? ''}',
                    value: d['receive_alerts'] == true,
                    onChanged: _saving
                        ? null
                        : (on) => _save(p, {
                              'dependents': [
                                for (final x in p.dependents)
                                  {
                                    'patient_id': x['patient_id'],
                                    'receive_alerts': x['patient_id'] == d['patient_id'] ? on : x['receive_alerts'],
                                  },
                              ],
                            }),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  IconData _icon(String channel) => switch (channel) {
        'web_push' => PhosphorIconsRegular.bell,
        'email' => PhosphorIconsRegular.envelopeSimple,
        _ => PhosphorIconsRegular.house,
      };
}
