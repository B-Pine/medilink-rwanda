import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/models.dart';
import '../../data/profile.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/controls.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';
import '../../ui/sub_page.dart';

/// Link a record a facility already made for you (contract §3.2 claims): find it, then a code sent
/// to the contact on that record, or a check at reception.
class ClaimScreen extends ConsumerStatefulWidget {
  const ClaimScreen({super.key});

  @override
  ConsumerState<ClaimScreen> createState() => _ClaimScreenState();
}

class _ClaimScreenState extends ConsumerState<ClaimScreen> {
  final _value = TextEditingController();
  final _name = TextEditingController();
  final _code = TextEditingController();
  String _way = 'medilink_number';
  DateTime? _born;
  Json? _claim;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _value.dispose();
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _ready =>
      _born != null && _value.text.trim().length >= 4 && (_way != 'phone' || _name.text.trim().isNotEmpty);

  Json get _lookup => switch (_way) {
        'national_id' => {
            'identifier': {'kind': 'national_id', 'issuing_country': 'RW', 'value': _value.text.replaceAll(' ', '')},
          },
        'phone' => {'phone_e164': _phone(_value.text), 'full_name': _name.text.trim()},
        _ => {'medilink_number': _value.text.trim().toUpperCase()},
      };

  String _phone(String raw) {
    final d = raw.replaceAll(RegExp(r'[^0-9+]'), '');
    if (d.startsWith('+')) return d;
    if (d.startsWith('0')) return '+250${d.substring(1)}';
    return d.startsWith('250') ? '+$d' : '+250$d';
  }

  Future<bool> _find() async {
    setState(() => _error = null);
    try {
      final data = await ref.read(apiProvider).post('/api/v1/patient/record-claims/', {
        'lookup': _lookup,
        'date_of_birth': apiDate(_born!),
      });
      setState(() => _claim = data as Json);
      return true;
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  Future<bool> _verify() async {
    setState(() => _error = null);
    try {
      await ref.read(apiProvider).post('/api/v1/patient/record-claims/${_claim!['id']}/verify/', {'code': _code.text.trim()});
      ref.invalidate(meProvider);
      setState(() => _done = true);
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
    final claim = _claim;
    final Widget? action = _done || (claim != null && claim['status'] == 'awaiting_reception')
        ? null
        : claim == null
            ? LoadingButton(label: s.t('findMyRecord'), onPressed: _ready ? _find : null)
            : LoadingButton(label: s.t('confirm'), onPressed: _code.text.trim().length >= 4 ? _verify : null);
    return SubPage(
      title: s.t('claimTitle'),
      bottomBar: action == null ? null : BottomActionBar(child: action),
      children: [
          if (_done)
            EmptyState(icon: PhosphorIconsFill.checkCircle, text: s.t('claimDone'))
          else if (claim == null) ...[
            Text(s.t('claimIntro'), style: theme.textTheme.bodyMedium),
            const SizedBox(height: Space.lg),
            SegmentedControl<String>(
              options: [
                ('medilink_number', s.t('medilinkNumber')),
                ('national_id', s.t('national_id')),
                ('phone', s.t('phone')),
              ],
              value: _way,
              onChanged: (way) => setState(() {
                _way = way;
                _value.clear();
              }),
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _value,
              keyboardType: _way == 'medilink_number' ? TextInputType.text : TextInputType.number,
              textCapitalization: TextCapitalization.characters,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: switch (_way) {
                  'national_id' => s.t('national_id'),
                  'phone' => s.t('phone'),
                  _ => s.t('medilinkNumber'),
                },
              ),
            ),
            if (_way == 'phone') ...[
              const SizedBox(height: Space.md),
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: s.t('fullName')),
              ),
            ],
            const SizedBox(height: Space.md),
            FieldButton(
              label: s.t('dateOfBirth'),
              value: _born == null ? null : fmt.day(_born!, s, relative: false),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _born ?? DateTime(1995),
                  firstDate: DateTime(1900),
                  lastDate: DateTime.now(),
                );
                if (picked != null) setState(() => _born = picked);
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: Space.md),
              Text(_error!, style: theme.textTheme.bodyMedium?.copyWith(color: Palette.danger)),
            ],
          ] else if (claim['status'] == 'awaiting_reception') ...[
            EmptyState(icon: PhosphorIconsRegular.buildings, text: s.t('claimAtReception')),
            const SizedBox(height: Space.lg),
            Center(
              child: SelectableText(
                '${claim['reference'] ?? ''}',
                style: theme.textTheme.headlineMedium?.copyWith(color: Palette.brand, letterSpacing: 2).tabular,
              ),
            ),
          ] else ...[
            Text(
              '${s.t('claimCodeSent')} ${claim['contact_hint'] ?? ''}',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              onChanged: (_) => setState(() {}),
              style: theme.textTheme.titleLarge?.copyWith(letterSpacing: 6).tabular,
              decoration: InputDecoration(labelText: s.t('code')),
            ),
            if (_error != null) ...[
              const SizedBox(height: Space.md),
              Text(_error!, style: theme.textTheme.bodyMedium?.copyWith(color: Palette.danger)),
            ],
          ],
      ],
    );
  }
}
