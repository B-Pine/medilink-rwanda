import 'package:dio/dio.dart' show FormData, MultipartFile;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/format.dart' as fmt;
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/profile.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/controls.dart';
import '../../ui/feedback.dart';
import '../../ui/grouped.dart';
import '../../ui/icons.dart';
import '../../ui/insurers.dart';
import '../../ui/secure_screen.dart';
import '../../ui/sub_page.dart';

/// A profile, fully editable in the app (same as the website's dashboard): photo, details,
/// emergency contact, identity documents, insurance cards and health profile.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key, required this.patientId});

  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final profile = ref.watch(profileDetailProvider(patientId));
    return SecureScreen(
      child: SubPage(
        title: profile.value == null || profile.value!.isSelf ? s.t('myProfile') : profile.value!.fullName,
        onRefresh: profile.hasValue
            ? () async {
                refreshProfile(ref, patientId);
                await ref.read(profileDetailProvider(patientId).future);
              }
            : null,
        children: profile.when(
          loading: () => const [SkeletonList(count: 4)],
          error: (e, _) => [ErrorState(error: e, onRetry: () => ref.invalidate(profileDetailProvider(patientId)))],
          data: (p) => [
                _Header(profile: p),
                const SizedBox(height: Space.xl),
                _Completion(profile: p),
                _Section(
                  title: s.t('details'),
                  action: s.t('edit'),
                  onAction: () => _sheet(context, _DetailsSheet(profile: p)),
                  child: _Details(profile: p),
                ),
                _Section(
                  title: s.t('emergencyContact'),
                  action: p.emergency == null ? s.t('add') : s.t('edit'),
                  onAction: () => _sheet(context, _EmergencySheet(profile: p)),
                  child: _EmergencyRow(profile: p),
                ),
                _Section(
                  title: s.t('identityDocuments'),
                  action: s.t('add'),
                  onAction: () => _sheet(context, _IdentifierSheet(patientId: patientId)),
                  child: _Identifiers(patientId: patientId),
                ),
                _Section(
                  title: s.t('insuranceCards'),
                  action: s.t('add'),
                  onAction: () => _sheet(context, _InsuranceSheet(patientId: patientId)),
                  child: _Insurance(patientId: patientId),
                ),
                _Section(
                  title: s.t('healthProfile'),
                  child: _Health(patientId: patientId, profile: p),
                ),
          ],
        ),
      ),
    );
  }
}

Future<void> _sheet(BuildContext context, Widget sheet) =>
    showModalBottomSheet<void>(context: context, isScrollControlled: true, useSafeArea: true, builder: (_) => sheet);

// ---- header: photo, name, MediLink number ------------------------------------------------------

class _Header extends ConsumerWidget {
  const _Header({required this.profile});
  final ProfileDetail profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return SoftCard(
      color: Palette.forest,
      child: Padding(
        padding: const EdgeInsets.all(Space.xl),
        child: Row(
          children: [
            ProfilePhoto(
              patientId: profile.patientId,
              name: profile.fullName,
              hasPhoto: profile.hasPhoto,
              size: 76,
              onTap: () => _sheet(context, _PhotoSheet(profile: profile)),
              editable: true,
            ),
            const SizedBox(width: Space.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile.fullName,
                    style: theme.textTheme.titleLarge?.copyWith(color: Colors.white),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: Space.xs),
                  if (profile.medilinkNumber != null)
                    GestureDetector(
                      onLongPress: () {
                        Clipboard.setData(ClipboardData(text: profile.medilinkNumber!));
                        HapticFeedback.selectionClick();
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('copied'))));
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: Palette.forestRaised, borderRadius: BorderRadius.circular(99)),
                        child: Text(
                          profile.medilinkNumber!,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: Palette.onForestAccent,
                            letterSpacing: 1.2,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ),
                  if (!profile.isSelf) ...[
                    const SizedBox(height: Space.xs),
                    Text(s.t(profile.relationship), style: theme.textTheme.bodySmall?.copyWith(color: Palette.onForestMuted)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The photo, or initials while there is none (or it is still being checked).
class ProfilePhoto extends ConsumerWidget {
  const ProfilePhoto({
    super.key,
    required this.patientId,
    required this.name,
    required this.hasPhoto,
    this.size = 56,
    this.onTap,
    this.editable = false,
  });

  final String patientId, name;
  final bool hasPhoto, editable;
  final double size;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = hasPhoto ? ref.watch(photoUrlProvider(patientId)).value : null;
    final initials = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();
    final circle = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Palette.forestRaised,
        border: Border.all(color: Palette.onForestAccent, width: 2),
        image: url == null ? null : DecorationImage(image: NetworkImage(url), fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: url == null
          ? Text(initials, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white))
          : null,
    );
    if (!editable) return circle;
    return Semantics(
      button: true,
      label: S.of(context).t('changePhoto'),
      child: GestureDetector(
        onTap: onTap,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            circle,
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Palette.onForestAccent,
                  shape: BoxShape.circle,
                  border: Border.all(color: Palette.forest, width: 2),
                ),
                child: Icon(PhosphorIconsRegular.plus, size: 16, color: Palette.forest),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoSheet extends ConsumerStatefulWidget {
  const _PhotoSheet({required this.profile});
  final ProfileDetail profile;

  @override
  ConsumerState<_PhotoSheet> createState() => _PhotoSheetState();
}

class _PhotoSheetState extends ConsumerState<_PhotoSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _pick(ImageSource source) async {
    final s = S.of(context);
    final picked = await ImagePicker().pickImage(source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 85);
    if (picked == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final form = FormData.fromMap({'file': await MultipartFile.fromFile(picked.path, filename: 'photo.jpg')});
      await ref.read(apiProvider).post('/api/v1/patient/profiles/${widget.profile.patientId}/photo/', form);
      refreshProfile(ref, widget.profile.patientId);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.detail.isNotEmpty ? e.detail : s.somethingWrong);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).delete('/api/v1/patient/profiles/${widget.profile.patientId}/photo/');
      refreshProfile(ref, widget.profile.patientId);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.detail);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return _SheetFrame(
      title: s.t('profilePhoto'),
      children: [
        Text(s.t('photoWhoSees'), style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: Space.md),
        if (_busy) const Padding(padding: EdgeInsets.all(Space.lg), child: Center(child: LoadingDots())),
        if (!_busy) ...[
          ListTile(
            leading: Icon(PhosphorIconsRegular.userCircle, color: Palette.brand),
            title: Text(s.t('takePhoto')),
            onTap: () => _pick(ImageSource.camera),
          ),
          ListTile(
            leading: Icon(PhosphorIconsRegular.fileText, color: Palette.brand),
            title: Text(s.t('choosePhoto')),
            onTap: () => _pick(ImageSource.gallery),
          ),
          if (widget.profile.hasPhoto)
            ListTile(
              leading: Icon(PhosphorIconsRegular.xCircle, color: Palette.danger),
              title: Text(s.t('removePhoto'), style: TextStyle(color: Palette.danger)),
              onTap: _remove,
            ),
        ],
        if (_error != null) Text(_error!, style: TextStyle(color: Palette.danger)),
      ],
    );
  }
}

// ---- completion ------------------------------------------------------------------------------

class _Completion extends StatelessWidget {
  const _Completion({required this.profile});
  final ProfileDetail profile;

  static const _labels = {
    'details': 'stepDetails',
    'identifier': 'stepIdentifier',
    'emergency_contact': 'stepEmergency',
    'care_consent': 'stepConsent',
    'insurance': 'stepInsurance',
    'allergies_reviewed': 'stepAllergies',
  };

  void _open(BuildContext context, String key) {
    final s = S.of(context);
    final id = profile.patientId;
    switch (key) {
      case 'details':
        _sheet(context, _DetailsSheet(profile: profile));
      case 'identifier':
        _sheet(context, _IdentifierSheet(patientId: id));
      case 'emergency_contact':
        _sheet(context, _EmergencySheet(profile: profile));
      case 'care_consent':
        context.go('/me/privacy');
      case 'insurance':
        _sheet(context, _InsuranceSheet(patientId: id));
      case 'allergies_reviewed':
        _sheet(context, _HealthSheet(patientId: id, kind: 'allergies', title: s.t('allergies'), profile: profile));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final missing = profile.completion.entries.where((e) => !e.value).map((e) => e.key).toList();
    if (missing.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.lg),
      child: SoftCard(
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(s.t('profileTodo'), style: theme.textTheme.titleMedium)),
                  Text('${profile.percent}%', style: theme.textTheme.titleMedium?.copyWith(color: Palette.brand)),
                ],
              ),
              const SizedBox(height: Space.sm),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: profile.percent / 100,
                  minHeight: 8,
                  backgroundColor: Palette.brandSubtle,
                ),
              ),
              const SizedBox(height: Space.md),
              // each missing step opens the same form as its section's Edit / Add
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: [
                  for (final key in missing)
                    Semantics(
                      button: true,
                      child: Material(
                        color: Palette.page,
                        borderRadius: BorderRadius.circular(Space.radiusSm),
                        child: InkWell(
                          key: ValueKey('todo-$key'),
                          borderRadius: BorderRadius.circular(Space.radiusSm),
                          onTap: () => _open(context, key),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(minHeight: 40),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(PhosphorIconsRegular.plus, size: 14, color: Palette.ochreText),
                                  const SizedBox(width: 4),
                                  Text(s.t(_labels[key] ?? key), style: theme.textTheme.labelMedium),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              if (missing.contains('care_consent')) ...[
                const SizedBox(height: Space.sm),
                TextButton.icon(
                  onPressed: () => context.go('/me/privacy'),
                  icon: const Icon(PhosphorIconsRegular.shieldCheck, size: 18),
                  label: Text(s.t('giveCareConsent')),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ---- a titled card -----------------------------------------------------------------------------

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      GroupedSection(label: title, action: action, onAction: onAction, children: [child]);
}

/// A detail: its label above its value, in the grouped-row layout.
class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: Space.row),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.md),
          child: Row(
            children: [
              SizedBox(width: 24, child: Icon(icon, size: 22, color: Palette.brand)),
              const SizedBox(width: Space.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 2),
                    Text(value.isEmpty ? '—' : value, style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.profile});
  final ProfileDetail profile;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final p = profile;
    final rows = [
      _Row(icon: PhosphorIconsRegular.user, label: s.t('fullName'), value: p.fullName),
      _Row(
        icon: PhosphorIconsRegular.cake,
        label: s.t('dateOfBirth'),
        value: p.dateOfBirth == null ? '' : fmt.day(p.dateOfBirth!, s, relative: false),
      ),
      _Row(icon: PhosphorIconsRegular.genderIntersex, label: s.t('sex'), value: p.sex == null ? '' : s.t(p.sex!)),
      _Row(icon: PhosphorIconsRegular.phone, label: s.t('phone'), value: p.phone ?? ''),
      _Row(icon: PhosphorIconsRegular.envelopeSimple, label: s.email, value: p.email ?? ''),
      _Row(icon: PhosphorIconsRegular.mapPin, label: s.t('address'), value: p.address ?? ''),
    ];
    return Column(
      children: [
        for (final (i, row) in rows.indexed) ...[if (i > 0) const Divider(height: 1, indent: 56), row],
      ],
    );
  }
}

class _EmergencyRow extends StatelessWidget {
  const _EmergencyRow({required this.profile});
  final ProfileDetail profile;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final c = profile.emergency;
    if (c == null) {
      return Padding(
        padding: const EdgeInsets.all(Space.lg),
        child: Text(s.t('emergencyHint'), style: Theme.of(context).textTheme.bodySmall),
      );
    }
    return _Row(
      icon: PhosphorIconsRegular.phoneCall,
      label: '${c['name'] ?? ''} · ${c['relationship'] ?? ''}',
      value: '${c['phone_e164'] ?? ''}',
    );
  }
}

// ---- identity documents ------------------------------------------------------------------------

const _identifierKinds = ['national_id', 'passport', 'refugee_id', 'birth_certificate'];

class _Identifiers extends ConsumerWidget {
  const _Identifiers({required this.patientId});
  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return ref.watch(identifiersProvider(patientId)).when(
          loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: LinearProgressIndicator()),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(identifiersProvider(patientId))),
          data: (list) => list.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(Space.lg),
                  child: Text(s.t('identifierHint'), style: Theme.of(context).textTheme.bodySmall),
                )
              : Column(
                  children: [
                    for (final (i, d) in list.indexed) ...[
                      if (i > 0) const Divider(height: 1, indent: 56),
                      GroupedRow(
                        icon: PhosphorIconsRegular.identificationCard,
                        title: s.t(d.kind),
                        subtitle: d.masked,
                        trailing: d.verified
                            ? StatusPill(text: s.t('verified'), tone: PillTone.brand)
                            : StatusPill(text: s.t('notVerified'), tone: PillTone.muted),
                      ),
                    ],
                  ],
                ),
        );
  }
}

// ---- insurance ---------------------------------------------------------------------------------

class _Insurance extends ConsumerWidget {
  const _Insurance({required this.patientId});
  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return ref.watch(insuranceProvider(patientId)).when(
          loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: LinearProgressIndicator()),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(insuranceProvider(patientId))),
          data: (cards) => cards.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(Space.lg),
                  child: Text(s.t('insuranceHint'), style: Theme.of(context).textTheme.bodySmall),
                )
              : Column(
                  children: [
                    for (final (i, c) in cards.indexed) ...[
                      if (i > 0) const Divider(height: 1, indent: 56),
                      GroupedRow(
                        icon: PhosphorIconsRegular.shieldCheck,
                        title: c.insurerName.isNotEmpty ? c.insurerName : insurerName(c.insurerCode, s),
                        subtitle: [
                          c.memberNumber,
                          if (!c.isPrincipal && c.principalName != null) c.principalName!,
                          if (c.validUntil != null) '${s.t('validUntil')} ${fmt.day(c.validUntil!, s, relative: false)}',
                        ].join(' · '),
                        trailing: StatusPill(
                          text: c.isExpired ? s.t('expired') : s.t(c.status),
                          tone: c.isExpired || c.status == 'rejected'
                              ? PillTone.danger
                              : c.status == 'verified'
                                  ? PillTone.brand
                                  : PillTone.ochre,
                        ),
                        onLongPress: () async {
                          if (await confirmDanger(context, title: s.t('stopUsingCard'), action: s.t('stopUsing'))) {
                            await ref.read(apiProvider).post('/api/v1/patient/insurance-profiles/${c.id}/deactivate/');
                            refreshProfile(ref, patientId);
                          }
                        },
                      ),
                    ],
                  ],
                ),
        );
  }
}

// ---- health ------------------------------------------------------------------------------------

class _Health extends ConsumerWidget {
  const _Health({required this.patientId, required this.profile});
  final String patientId;
  final ProfileDetail profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return ref.watch(healthProvider(patientId)).when(
          loading: () => const Padding(padding: EdgeInsets.all(Space.lg), child: LinearProgressIndicator()),
          error: (e, _) => ErrorState(error: e, onRetry: () => ref.invalidate(healthProvider(patientId))),
          data: (h) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (i, (kind, title, icon)) in [
                ('allergies', s.t('allergies'), PhosphorIconsRegular.warningCircle),
                ('conditions', s.t('conditions'), PhosphorIconsRegular.stethoscope),
                ('medications', s.medications, PhosphorIconsRegular.pill),
              ].indexed) ...[
                if (i > 0) const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(Space.lg, Space.md, Space.sm, Space.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(icon, size: 20, color: Palette.brand),
                          const SizedBox(width: Space.sm),
                          Expanded(child: Text(title, style: theme.textTheme.titleSmall)),
                          IconButton(
                            tooltip: s.t('add'),
                            onPressed: () => _sheet(context, _HealthSheet(patientId: patientId, kind: kind, title: title)),
                            icon: Icon(PhosphorIconsRegular.plus, color: Palette.brand),
                          ),
                        ],
                      ),
                      if (kind == 'allergies' && h.allergies.isEmpty)
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(s.t('noKnownAllergies')),
                          value: h.noKnownAllergies ?? false,
                          onChanged: (on) async {
                            await ref
                                .read(apiProvider)
                                .patch('/api/v1/patient/profiles/$patientId/', {'version': profile.version, 'no_known_allergies': on});
                            refreshProfile(ref, patientId);
                          },
                        ),
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: Space.sm,
                        children: [
                          for (final item in h.of(kind))
                            InputChip(
                              label: Text(item.label),
                              avatar: item.fromClinician
                                  ? Icon(PhosphorIconsRegular.stethoscope, size: 16, color: Palette.brand)
                                  : null,
                              backgroundColor: Palette.page,
                              side: BorderSide.none,
                              onDeleted: item.fromClinician
                                  ? null
                                  : () async {
                                      if (await confirmDanger(context, title: s.t('removeItem'), action: s.t('remove'))) {
                                        await ref
                                            .read(apiProvider)
                                            .post('/api/v1/patient/profiles/$patientId/$kind/${item.id}/entered-in-error/');
                                        refreshProfile(ref, patientId);
                                      }
                                    },
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
  }
}

// ---- sheets ------------------------------------------------------------------------------------

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(Space.xl, 0, Space.xl, Space.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: Space.lg),
              ...children,
            ],
          ),
        ),
      );
}

/// Shared save: shows the server's message under the form on a refusal.
mixin _Saving<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  String? error;

  Future<bool> save(String patientId, Future<void> Function(Api api) call) async {
    setState(() => error = null);
    try {
      await call(ref.read(apiProvider));
      refreshProfile(ref, patientId);
      Future<void>.delayed(const Duration(milliseconds: 500), () {
        if (mounted) Navigator.pop(context);
      });
      return true;
    } on ApiException catch (e) {
      setState(() => error = e.detail.isNotEmpty ? e.detail : S.of(context).somethingWrong);
      return false;
    }
  }

  Widget errorText() => error == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: Space.md),
          child: Text(error!, style: TextStyle(color: Palette.danger)),
        );
}

class _Choice extends StatelessWidget {
  const _Choice({required this.options, required this.value, required this.onPick});
  final List<(String, String)> options;
  final String? value;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: Space.sm,
        runSpacing: Space.sm,
        children: [
          for (final (code, label) in options)
            ChoiceChip(
              label: Text(label, style: TextStyle(color: code == value ? Palette.onBrand : Palette.ink, fontWeight: FontWeight.w600)),
              selected: code == value,
              showCheckmark: false,
              selectedColor: Palette.brand,
              backgroundColor: Palette.surface,
              side: BorderSide(color: code == value ? Palette.brand : Palette.hairline),
              onSelected: (_) => onPick(code),
            ),
        ],
      );
}

String? _e164(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.isEmpty) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return '+250${digits.substring(1)}';
  if (digits.startsWith('250')) return '+$digits';
  return '+250$digits';
}

class _DetailsSheet extends ConsumerStatefulWidget {
  const _DetailsSheet({required this.profile});
  final ProfileDetail profile;

  @override
  ConsumerState<_DetailsSheet> createState() => _DetailsSheetState();
}

class _DetailsSheetState extends ConsumerState<_DetailsSheet> with _Saving {
  late final _name = TextEditingController(text: widget.profile.fullName);
  late final _phone = TextEditingController(text: widget.profile.phone ?? '');
  late final _email = TextEditingController(text: widget.profile.email ?? '');
  late final _address = TextEditingController(text: widget.profile.address ?? '');
  late DateTime? _born = widget.profile.dateOfBirth;
  late String? _sex = widget.profile.sex;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final p = widget.profile;
    return _SheetFrame(
      title: s.t('details'),
      children: [
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: s.t('fullName'))),
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
        const SizedBox(height: Space.md),
        _Choice(
          options: [('female', s.t('female')), ('male', s.t('male'))],
          value: _sex,
          onPick: (v) => setState(() => _sex = v),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(labelText: s.t('phone'), hintText: '07xx xxx xxx'),
        ),
        const SizedBox(height: Space.md),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: s.email)),
        const SizedBox(height: Space.md),
        TextField(controller: _address, decoration: InputDecoration(labelText: s.t('address'))),
        errorText(),
        const SizedBox(height: Space.xl),
        LoadingButton(
          label: s.t('save'),
          onPressed: _name.text.trim().isEmpty
              ? null
              : () => save(p.patientId, (api) async {
                    await api.patch('/api/v1/patient/profiles/${p.patientId}/', {
                      'version': p.version,
                      if (_name.text.trim() != p.fullName) 'full_name': _name.text.trim(),
                      if (_born != p.dateOfBirth) 'date_of_birth': _born == null ? null : apiDate(_born!),
                      if (_sex != p.sex) 'sex': _sex,
                      'phone_e164': _e164(_phone.text),
                      'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
                      'address': _address.text.trim().isEmpty ? null : _address.text.trim(),
                    });
                  }),
        ),
      ],
    );
  }
}

class _EmergencySheet extends ConsumerStatefulWidget {
  const _EmergencySheet({required this.profile});
  final ProfileDetail profile;

  @override
  ConsumerState<_EmergencySheet> createState() => _EmergencySheetState();
}

class _EmergencySheetState extends ConsumerState<_EmergencySheet> with _Saving {
  late final _name = TextEditingController(text: '${widget.profile.emergency?['name'] ?? ''}');
  late final _phone = TextEditingController(text: '${widget.profile.emergency?['phone_e164'] ?? ''}');
  late String? _relationship = widget.profile.emergency?['relationship'] as String?;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final p = widget.profile;
    final ready = _name.text.trim().isNotEmpty && _phone.text.trim().length >= 9 && _relationship != null;
    return _SheetFrame(
      title: s.t('emergencyContact'),
      children: [
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.t('fullName')),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.t('phone'), hintText: '07xx xxx xxx'),
        ),
        const SizedBox(height: Space.md),
        // free text on the server: the word is stored as the patient reads it
        _Choice(
          options: [
            for (final key in const ['spouse', 'parent', 'child', 'sibling', 'friend', 'otherRelation'])
              (s.t(key), s.t(key)),
          ],
          value: _relationship,
          onPick: (v) => setState(() => _relationship = v),
        ),
        errorText(),
        const SizedBox(height: Space.xl),
        LoadingButton(
          label: s.t('save'),
          onPressed: !ready
              ? null
              : () => save(p.patientId, (api) async {
                    await api.patch('/api/v1/patient/profiles/${p.patientId}/', {
                      'version': p.version,
                      'emergency_contact': {
                        'name': _name.text.trim(),
                        'phone_e164': _e164(_phone.text),
                        'relationship': _relationship,
                      },
                    });
                  }),
        ),
      ],
    );
  }
}

class _IdentifierSheet extends ConsumerStatefulWidget {
  const _IdentifierSheet({required this.patientId});
  final String patientId;

  @override
  ConsumerState<_IdentifierSheet> createState() => _IdentifierSheetState();
}

class _IdentifierSheetState extends ConsumerState<_IdentifierSheet> with _Saving {
  final _value = TextEditingController();
  String _kind = 'national_id';

  @override
  void dispose() {
    _value.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return _SheetFrame(
      title: s.t('addIdentityDocument'),
      children: [
        _Choice(
          options: [for (final k in _identifierKinds) (k, s.t(k))],
          value: _kind,
          onPick: (v) => setState(() => _kind = v),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _value,
          keyboardType: _kind == 'national_id' ? TextInputType.number : TextInputType.text,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: s.t('documentNumber'),
            hintText: _kind == 'national_id' ? '1 1990 8 0012345 0 12' : null,
          ),
        ),
        const SizedBox(height: Space.sm),
        Text(s.t('identifierPrivate'), style: Theme.of(context).textTheme.bodySmall),
        errorText(),
        const SizedBox(height: Space.xl),
        LoadingButton(
          label: s.t('save'),
          onPressed: _value.text.trim().length < 4
              ? null
              : () => save(widget.patientId, (api) async {
                    await api.post('/api/v1/patient/profiles/${widget.patientId}/identifiers/', {
                      'kind': _kind,
                      'issuing_country': 'RW',
                      'value': _value.text.replaceAll(' ', ''),
                    });
                  }),
        ),
      ],
    );
  }
}

class _InsuranceSheet extends ConsumerStatefulWidget {
  const _InsuranceSheet({required this.patientId});
  final String patientId;

  @override
  ConsumerState<_InsuranceSheet> createState() => _InsuranceSheetState();
}

class _InsuranceSheetState extends ConsumerState<_InsuranceSheet> with _Saving {
  final _member = TextEditingController();
  final _principalName = TextEditingController();
  final _principalNumber = TextEditingController();
  String _insurer = 'mutuelle';
  bool _principal = true;
  String? _relation;
  DateTime? _until;

  @override
  void dispose() {
    _member.dispose();
    _principalName.dispose();
    _principalNumber.dispose();
    super.dispose();
  }

  bool get _ready =>
      _member.text.trim().isNotEmpty &&
      (_principal || (_principalName.text.trim().isNotEmpty && _relation != null));

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return _SheetFrame(
      title: s.t('addInsurance'),
      children: [
        _Choice(
          options: [for (final c in const ['mutuelle', 'rama', 'mmi', 'private_other']) (c, insurerName(c, s))],
          value: _insurer,
          onPick: (v) => setState(() => _insurer = v),
        ),
        const SizedBox(height: Space.md),
        TextField(
          controller: _member,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.t('memberNumber')),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(s.t('cardInMyName')),
          value: _principal,
          onChanged: (on) => setState(() => _principal = on),
        ),
        if (!_principal) ...[
          TextField(
            controller: _principalName,
            textCapitalization: TextCapitalization.words,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: s.t('cardHolderName')),
          ),
          const SizedBox(height: Space.md),
          TextField(controller: _principalNumber, decoration: InputDecoration(labelText: s.t('cardHolderNumber'))),
          const SizedBox(height: Space.md),
          _Choice(
            options: [('spouse', s.t('spouse')), ('child', s.t('child')), ('parent', s.t('parent')), ('other', s.t('otherRelation'))],
            value: _relation,
            onPick: (v) => setState(() => _relation = v),
          ),
        ],
        const SizedBox(height: Space.md),
        FieldButton(
          label: _until == null ? s.t('validUntilOptional') : s.t('validUntil'),
          value: _until == null ? null : fmt.day(_until!, s, relative: false),
          onTap: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: _until ?? DateTime(now.year, 12, 31),
              firstDate: now,
              lastDate: DateTime(now.year + 10),
            );
            if (picked != null) setState(() => _until = picked);
          },
        ),
        errorText(),
        const SizedBox(height: Space.xl),
        LoadingButton(
          label: s.t('save'),
          onPressed: !_ready
              ? null
              : () => save(widget.patientId, (api) async {
                    await api.post('/api/v1/patient/profiles/${widget.patientId}/insurance-profiles/', {
                      'insurer_code': _insurer,
                      'member_number': _member.text.trim(),
                      'is_principal': _principal,
                      if (!_principal) 'principal_name': _principalName.text.trim(),
                      if (!_principal && _principalNumber.text.trim().isNotEmpty)
                        'principal_member_number': _principalNumber.text.trim(),
                      if (!_principal) 'relationship_to_principal': _relation,
                      if (_until != null) 'valid_until': apiDate(_until!),
                    });
                  }),
        ),
      ],
    );
  }
}

class _HealthSheet extends ConsumerStatefulWidget {
  const _HealthSheet({required this.patientId, required this.kind, required this.title, this.profile});
  final String patientId, kind, title;

  /// Given from the profile to-do: allergies also offer "I have no known allergies".
  final ProfileDetail? profile;

  @override
  ConsumerState<_HealthSheet> createState() => _HealthSheetState();
}

class _HealthSheetState extends ConsumerState<_HealthSheet> with _Saving {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final field = switch (widget.kind) {
      'allergies' => 'substance_text',
      'conditions' => 'display',
      _ => 'drug_display',
    };
    return _SheetFrame(
      title: widget.title,
      children: [
        TextField(
          controller: _text,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.t('healthItemHint')),
        ),
        const SizedBox(height: Space.sm),
        Text(s.t('healthItemNote'), style: Theme.of(context).textTheme.bodySmall),
        errorText(),
        const SizedBox(height: Space.xl),
        LoadingButton(
          label: s.t('save'),
          onPressed: _text.text.trim().isEmpty
              ? null
              : () => save(widget.patientId, (api) async {
                    await api.post('/api/v1/patient/profiles/${widget.patientId}/${widget.kind}/', {
                      if (widget.kind == 'allergies') 'category': 'other',
                      field: _text.text.trim(),
                    });
                  }),
        ),
        if (widget.kind == 'allergies' && widget.profile != null) ...[
          const SizedBox(height: Space.sm),
          TextButton(
            key: const ValueKey('no-known-allergies'),
            onPressed: () => save(widget.patientId, (api) async {
              await api.patch('/api/v1/patient/profiles/${widget.patientId}/', {
                'version': widget.profile!.version,
                'no_known_allergies': true,
              });
            }),
            child: Text(s.t('noKnownAllergies')),
          ),
        ],
      ],
    );
  }
}

/// The signed-in patient's own profile, for Me → My profile.
class MyProfileScreen extends ConsumerWidget {
  const MyProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return me.when(
      loading: () => const Scaffold(body: Center(child: LoadingDots())),
      error: (e, _) => Scaffold(body: ErrorState(error: e, onRetry: () => ref.invalidate(meProvider))),
      data: (me) {
        final self = me.profiles.where((p) => p.relationship == 'self').firstOrNull ?? me.profiles.firstOrNull;
        if (self == null) return const Scaffold(body: SizedBox.shrink());
        return ProfileScreen(patientId: self.patientId);
      },
    );
  }
}
