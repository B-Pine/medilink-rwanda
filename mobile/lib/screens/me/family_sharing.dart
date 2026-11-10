import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/config.dart';
import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/profile.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/grouped.dart';
import '../../ui/icons.dart';

/// Sharing a profile with another MediLink account (delegation, contract §3.2): make a one-time
/// code (your password confirms it), enter a code someone gave you, and stop sharing.
class FamilySharing extends ConsumerWidget {
  const FamilySharing({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final data = ref.watch(delegationsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GroupedSection(
          label: s.t('sharing'),
          margin: const EdgeInsets.only(bottom: Space.md),
          children: [
            GroupedRow(
              icon: PhosphorIconsFill.paperPlaneRight,
              title: s.t('shareProfile'),
              onTap: () => _open(context, const _InviteSheet()),
            ),
            GroupedRow(
              icon: PhosphorIconsRegular.ticket,
              title: s.t('enterCode'),
              onTap: () => _open(context, const _AcceptSheet()),
            ),
          ],
        ),
        data.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(delegationsProvider)),
          data: (d) {
            final rows = [
              for (final r in d.granted) (r, true),
              for (final r in d.received) (r, false),
            ];
            if (rows.isEmpty && d.pending.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: Space.lg),
                child: Text(s.t('sharingEmpty'), style: theme.textTheme.bodySmall),
              );
            }
            return GroupedSection(
              children: [
                for (final (r, mine) in rows)
                  GroupedRow(
                    icon: mine ? PhosphorIconsFill.paperPlaneRight : PhosphorIconsRegular.usersThree,
                    title: '${r['profile_name'] ?? ''}',
                    subtitle: mine ? '${s.t('sharedWith')} ${r['holder_name'] ?? ''}' : s.t('sharedWithMe'),
                    action: r['can_revoke'] == true
                        ? TextButton(
                            style: TextButton.styleFrom(foregroundColor: Palette.danger),
                            onPressed: () async {
                              if (await confirmDanger(context, title: s.t('stopSharingQ'), action: s.t('stopSharing'))) {
                                await ref.read(apiProvider).post('/api/v1/patient/delegations/${r['id']}/revoke/');
                                ref
                                  ..invalidate(delegationsProvider)
                                  ..invalidate(meProvider);
                              }
                            },
                            child: Text(s.t('stopSharing')),
                          )
                        : null,
                  ),
                for (final p in d.pending)
                  GroupedRow(
                    icon: PhosphorIconsRegular.clock,
                    iconColor: Palette.ochreText,
                    title: '${p['profile_name'] ?? ''}',
                    subtitle: '${s.t('codeWaiting')} ${_until(p['expires_at'], s)}',
                  ),
              ],
            );
          },
        ),
      ],
    );
  }

  static String _until(Object? iso, Strings s) {
    final at = iso is String ? DateTime.tryParse(iso)?.toLocal() : null;
    return at == null ? '' : '${fmt.day(at, s)} ${fmt.time(at)}';
  }

  static Future<void> _open(BuildContext context, Widget sheet) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => Padding(
          padding: EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl + MediaQuery.viewInsetsOf(context).bottom),
          child: sheet,
        ),
      );
}

class _InviteSheet extends ConsumerStatefulWidget {
  const _InviteSheet();

  @override
  ConsumerState<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends ConsumerState<_InviteSheet> {
  final _password = TextEditingController();
  String? _patientId, _error;
  Json? _invite;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<bool> _create() async {
    setState(() => _error = null);
    try {
      final data = await ref.read(apiProvider).post('/api/v1/patient/delegations/', {
        'patient_id': _patientId,
        'current_password': _password.text,
        'consent_version': AppConfig.termsVersion,
      });
      ref.invalidate(delegationsProvider);
      setState(() => _invite = data as Json);
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final profiles = ref.watch(meProvider).value?.profiles.where((p) => p.relationship != 'delegate').toList() ?? const <Profile>[];
    _patientId ??= profiles.firstOrNull?.patientId;
    final invite = _invite;
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.t('shareProfile'), style: theme.textTheme.titleLarge),
          const SizedBox(height: Space.md),
          if (invite != null) ...[
            Text(s.t('giveThisCode'), style: theme.textTheme.bodyMedium),
            const SizedBox(height: Space.lg),
            Center(
              child: SelectableText(
                '${invite['code']}',
                style: theme.textTheme.displaySmall?.copyWith(color: Palette.brand, letterSpacing: 4),
              ),
            ),
            const SizedBox(height: Space.sm),
            Center(child: Text('${s.t('codeWaiting')} ${FamilySharing._until(invite['expires_at'], s)}', style: theme.textTheme.bodySmall)),
            const SizedBox(height: Space.lg),
            FilledButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: '${invite['code']}'));
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('copied'))));
              },
              icon: const Icon(PhosphorIconsRegular.fileText),
              label: Text(s.t('copyCode')),
            ),
          ] else ...[
            Text(s.t('shareIntro'), style: theme.textTheme.bodySmall),
            const SizedBox(height: Space.md),
            if (profiles.length > 1)
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  for (final p in profiles)
                    ChoiceChip(
                      label: Text(p.displayName,
                          style: TextStyle(color: p.patientId == _patientId ? Palette.onBrand : Palette.ink, fontWeight: FontWeight.w600)),
                      selected: p.patientId == _patientId,
                      showCheckmark: false,
                      selectedColor: Palette.brand,
                      backgroundColor: Palette.surface,
                      onSelected: (_) => setState(() => _patientId = p.patientId),
                    ),
                ],
              ),
            const SizedBox(height: Space.md),
            TextField(
              controller: _password,
              obscureText: true,
              autofillHints: const [AutofillHints.password],
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: s.t('currentPassword'), prefixIcon: const Icon(PhosphorIconsRegular.lockKey)),
            ),
            if (_error != null) ...[
              const SizedBox(height: Space.md),
              Text(_error!, style: TextStyle(color: Palette.danger)),
            ],
            const SizedBox(height: Space.xl),
            LoadingButton(
              label: s.t('makeCode'),
              onPressed: _patientId == null || _password.text.isEmpty ? null : _create,
            ),
          ],
        ],
      ),
    );
  }
}

class _AcceptSheet extends ConsumerStatefulWidget {
  const _AcceptSheet();

  @override
  ConsumerState<_AcceptSheet> createState() => _AcceptSheetState();
}

class _AcceptSheetState extends ConsumerState<_AcceptSheet> {
  final _code = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<bool> _accept() async {
    setState(() => _error = null);
    try {
      await ref.read(apiProvider).post('/api/v1/patient/delegations/accept/', {'code': _code.text.trim()});
      ref
        ..invalidate(delegationsProvider)
        ..invalidate(meProvider);
      Future<void>.delayed(const Duration(milliseconds: 500), () {
        if (mounted) Navigator.pop(context);
      });
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(s.t('enterCode'), style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: Space.md),
        TextField(
          controller: _code,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.t('code')),
        ),
        if (_error != null) ...[
          const SizedBox(height: Space.md),
          Text(_error!, style: TextStyle(color: Palette.danger)),
        ],
        const SizedBox(height: Space.xl),
        LoadingButton(label: s.t('confirm'), onPressed: _code.text.trim().length >= 4 ? _accept : null),
      ],
    );
  }
}
