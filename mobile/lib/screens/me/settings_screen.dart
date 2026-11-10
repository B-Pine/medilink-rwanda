import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/appearance.dart';
import '../../data/session.dart';
import '../../ui/controls.dart';
import '../../ui/grouped.dart';
import '../../ui/sub_page.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool? _biometrics;
  bool _available = false;

  @override
  void initState() {
    super.initState();
    final auth = ref.read(authProvider.notifier);
    auth.canUseBiometrics().then((available) async {
      final on = await auth.biometricsEnabled();
      if (mounted) {
        setState(() {
          _available = available;
          _biometrics = on;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final language = ref.watch(languageProvider);
    final appearance = ref.watch(appearanceProvider);
    return SubPage(
      title: s.settings,
      children: [
        // Light or dark: like the phone (default), or always one of them.
        SectionLabel(s.t('appearance')),
        Padding(
          padding: const EdgeInsets.only(bottom: Space.xl),
          child: SegmentedControl<Appearance>(
            options: [for (final a in Appearance.values) (a, s.t('appearance.${a.name}'))],
            value: appearance,
            onChanged: (a) => ref.read(appearanceProvider.notifier).set(a),
          ),
        ),
        GroupedSection(
          label: s.language,
          children: [
            for (final (code, label) in Strings.languages)
              GroupedRow(
                icon: PhosphorIconsRegular.translate,
                title: label,
                trailing: code == language ? Icon(PhosphorIconsFill.checkCircle, color: Palette.brand) : null,
                chevron: false,
                onTap: () => ref.read(languageProvider.notifier).set(code),
              ),
          ],
        ),
        GroupedSection(
          children: [
            GroupedRow(
              icon: PhosphorIconsRegular.lockKey,
              title: s.t('changePassword'),
              onTap: () => context.go('/me/settings/password'),
            ),
            if (_available && _biometrics != null)
              GroupedSwitchRow(
                icon: PhosphorIconsRegular.fingerprint,
                title: s.useFingerprint,
                value: _biometrics!,
                onChanged: (on) async {
                  await ref.read(authProvider.notifier).setBiometrics(on);
                  setState(() => _biometrics = on);
                },
              ),
          ],
        ),
      ],
    );
  }
}
