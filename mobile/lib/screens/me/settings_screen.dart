import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/session.dart';

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
    return Scaffold(
      appBar: AppBar(title: Text(s.settings)),
      body: ListView(
        padding: const EdgeInsets.all(Space.lg),
        children: [
          Card(
            child: Column(
              children: [
                for (final (code, label) in const [('rw', 'Kinyarwanda'), ('en', 'English')])
                  ListTile(
                    leading: const Icon(PhosphorIconsRegular.translate, color: Palette.brand),
                    title: Text(label),
                    trailing: code == language
                        ? const Icon(PhosphorIconsFill.checkCircle, color: Palette.brand)
                        : null,
                    onTap: () => ref.read(languageProvider.notifier).set(code),
                  ),
              ],
            ),
          ),
          if (_available && _biometrics != null) ...[
            const SizedBox(height: Space.lg),
            Card(
              child: SwitchListTile(
                secondary: const Icon(PhosphorIconsRegular.fingerprint, color: Palette.brand),
                title: Text(s.useFingerprint),
                value: _biometrics!,
                onChanged: (on) async {
                  await ref.read(authProvider.notifier).setBiometrics(on);
                  setState(() => _biometrics = on);
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}
