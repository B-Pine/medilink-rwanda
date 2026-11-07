import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/controls.dart';
import '../../ui/grouped.dart';
import '../../ui/icons.dart';
import '../../ui/sub_page.dart';
import 'family_sharing.dart';

/// Consent text versions the API expects (GET /patient/consents/ current_versions).
final consentVersionsProvider = FutureProvider.autoDispose<Map<String, String>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/consents/');
  final versions = data is Map ? data['current_versions'] : null;
  return versions is Map ? versions.map((k, v) => MapEntry('$k', '$v')) : const {};
});

final profileProvider = FutureProvider.autoDispose.family<Json, String>((ref, patientId) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/profiles/$patientId/');
  return data! as Json;
});

String initialsOf(String name) => Avatar.initialsOf(name);

/// Everyone this account manages: the patient and their family members.
class FamilyScreen extends ConsumerWidget {
  const FamilyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final me = ref.watch(meProvider);
    return SubPage(
      title: s.family,
      bottomBar: BottomActionBar(
        child: FilledButton.icon(
          onPressed: () async {
            HapticFeedback.selectionClick();
            final added = await showModalBottomSheet<bool>(
              context: context,
              isScrollControlled: true,
              builder: (_) => const _AddMemberSheet(),
            );
            if (added ?? false) ref.invalidate(meProvider);
          },
          icon: const Icon(PhosphorIconsRegular.userPlus),
          label: Text(s.t('addMember')),
        ),
      ),
      children: me.when(
        loading: () => const [SkeletonList(count: 3)],
        error: (e, _) => [ErrorState(error: e, onRetry: () => ref.invalidate(meProvider))],
        data: (me) => [
          GroupedSection(
            inset: Space.lg + Avatar.medium + Space.lg,
            children: [
              for (final p in me.profiles)
                GroupedRow(
                  leading: Avatar(name: p.displayName),
                  title: p.displayName,
                  subtitle: s.t(p.relationship == 'self' ? 'you' : p.relationship),
                  onTap: () => context.go('/me/family/${p.patientId}'),
                ),
            ],
          ),
          const FamilySharing(),
        ],
      ),
    );
  }
}

class _AddMemberSheet extends ConsumerStatefulWidget {
  const _AddMemberSheet();

  @override
  ConsumerState<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends ConsumerState<_AddMemberSheet> {
  final _name = TextEditingController();
  final _age = TextEditingController();
  String _relationship = 'guardian';
  String _sex = 'female';
  DateTime? _born;
  bool _knowsDate = true;
  bool _attested = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _age.dispose();
    super.dispose();
  }

  bool get _ready =>
      _name.text.trim().isNotEmpty &&
      (_knowsDate ? _born != null : int.tryParse(_age.text) != null) &&
      (_relationship == 'guardian' || _attested);

  Future<bool> _save() async {
    final s = S.of(context);
    setState(() => _error = null);
    try {
      final versions = await ref.read(consentVersionsProvider.future);
      final kind = _relationship == 'guardian' ? 'guardian' : 'delegation';
      await ref.read(apiProvider).post('/api/v1/patient/dependents/', {
        'relationship': _relationship,
        'full_name': _name.text.trim(),
        'sex': _sex,
        if (_knowsDate && _born != null)
          'date_of_birth': '${_born!.year}-${fmt.two(_born!.month)}-${fmt.two(_born!.day)}'
        else
          'estimated_age_years': int.parse(_age.text),
        'consent_version': versions[kind] ?? '',
        'consent_attested': _attested || _relationship == 'guardian',
      });
      HapticFeedback.lightImpact();
      Future<void>.delayed(const Duration(milliseconds: 600), () {
        if (mounted) Navigator.pop(context, true);
      });
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : s.somethingWrong);
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(s.t('addMember'), style: theme.textTheme.titleLarge),
              const SizedBox(height: Space.lg),
              SegmentedControl<String>(
                options: [for (final v in const ['guardian', 'delegate']) (v, s.t(v))],
                value: _relationship,
                onChanged: (v) => setState(() => _relationship = v),
              ),
              const SizedBox(height: Space.lg),
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: s.fullName),
              ),
              const SizedBox(height: Space.lg),
              Text(s.t('sex'), style: theme.textTheme.labelMedium),
              const SizedBox(height: Space.sm),
              SegmentedControl<String>(
                options: [for (final v in const ['female', 'male', 'other']) (v, s.t(v))],
                value: _sex,
                onChanged: (v) => setState(() => _sex = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(s.t('knowsBirthDate')),
                value: _knowsDate,
                onChanged: (v) => setState(() => _knowsDate = v),
              ),
              if (_knowsDate)
                FieldButton(
                  label: s.t('dateOfBirth'),
                  value: _born == null ? null : fmt.day(_born!, s, relative: false),
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: DateTime(now.year - 120),
                      lastDate: now,
                      initialDate: _born ?? DateTime(now.year - 5),
                    );
                    if (picked != null) setState(() => _born = picked);
                  },
                )
              else
                TextField(
                  controller: _age,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(labelText: s.t('age')),
                ),
              if (_relationship == 'delegate')
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(s.t('attest')),
                  value: _attested,
                  onChanged: (v) => setState(() => _attested = v ?? false),
                ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.md),
                  child: Text(_error!, style: const TextStyle(color: Palette.danger)),
                ),
              const SizedBox(height: Space.xl),
              LoadingButton(label: s.t('add'), onPressed: _ready ? _save : null),
            ],
          ),
        ),
      ),
    );
  }
}
