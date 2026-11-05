import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/config.dart';
import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/api.dart';
import '../../data/session.dart';
import '../../ui/feedback.dart';
import '../../ui/icons.dart';

/// Change password (security 03 §6): current password, then the new one twice. The server ends
/// every other session and sends a "password changed" email; this phone stays signed in.
class PasswordScreen extends ConsumerStatefulWidget {
  const PasswordScreen({super.key});

  @override
  ConsumerState<PasswordScreen> createState() => _PasswordScreenState();
}

class _PasswordScreenState extends ConsumerState<PasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _show = false;
  String? _currentError, _nextError, _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  bool get _long => _next.text.length >= AppConfig.passwordMin;
  bool get _same => _next.text.isNotEmpty && _next.text == _again.text;
  bool get _ready => _current.text.isNotEmpty && _long && _same;

  Future<bool> _save() async {
    final s = S.of(context);
    setState(() => _currentError = _nextError = _error = null);
    try {
      await ref.read(apiProvider).post('/api/v1/patient/auth/password/', {
        'current_password': _current.text,
        'new_password': _next.text,
      });
      Future<void>.delayed(const Duration(milliseconds: 650), () {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('passwordChanged'))));
        context.pop();
      });
      return true;
    } on ApiException catch (e) {
      setState(() {
        _currentError = e.field('current_password');
        _nextError = e.field('new_password');
        if (_currentError == null && _nextError == null) {
          _error = e.detail.isNotEmpty ? e.detail : s.somethingWrong;
        }
      });
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    InputDecoration field(String label, IconData icon, String? error) => InputDecoration(
          labelText: label,
          errorText: error,
          errorMaxLines: 3,
          prefixIcon: Icon(icon),
          suffixIcon: IconButton(
            tooltip: _show ? s.t('hidePassword') : s.t('showPassword'),
            onPressed: () => setState(() => _show = !_show),
            icon: Icon(_show ? PhosphorIconsRegular.eyeSlash : PhosphorIconsRegular.eye),
          ),
        );
    return Scaffold(
      appBar: AppBar(title: Text(s.t('changePassword'))),
      body: AutofillGroup(
        child: ListView(
          padding: const EdgeInsets.all(Space.lg),
          children: [
            TextField(
              controller: _current,
              obscureText: !_show,
              autofillHints: const [AutofillHints.password],
              onChanged: (_) => setState(() {}),
              decoration: field(s.t('currentPassword'), PhosphorIconsRegular.lockKey, _currentError),
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _next,
              obscureText: !_show,
              autofillHints: const [AutofillHints.newPassword],
              onChanged: (_) => setState(() {}),
              decoration: field(s.t('newPassword'), PhosphorIconsRegular.shieldCheck, _nextError),
            ),
            const SizedBox(height: Space.lg),
            TextField(
              controller: _again,
              obscureText: !_show,
              autofillHints: const [AutofillHints.newPassword],
              onChanged: (_) => setState(() {}),
              decoration: field(s.t('repeatPassword'), PhosphorIconsRegular.shieldCheck, null),
            ),
            const SizedBox(height: Space.md),
            _Rule(done: _long, text: s.passwordRule),
            _Rule(done: _same, text: s.t('passwordsMatch')),
            if (_error != null) ...[
              const SizedBox(height: Space.md),
              Text(_error!, style: const TextStyle(color: Palette.danger)),
            ],
            const SizedBox(height: Space.xl),
            LoadingButton(label: s.t('changePassword'), onPressed: _ready ? _save : null),
            const SizedBox(height: Space.md),
            Text(s.t('passwordOtherDevices'), style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule({required this.done, required this.text});
  final bool done;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          children: [
            Icon(
              done ? PhosphorIconsFill.checkCircle : PhosphorIconsRegular.xCircle,
              size: 18,
              color: done ? Palette.brand : Palette.muted,
            ),
            const SizedBox(width: Space.sm),
            Text(text, style: TextStyle(color: done ? Palette.ink : Palette.muted)),
          ],
        ),
      );
}
