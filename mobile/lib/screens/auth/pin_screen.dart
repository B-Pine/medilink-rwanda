import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/session.dart';
import '../../ui/band.dart';
import '../../ui/logo.dart';

const _pinLength = 4;

/// Set a PIN after sign-in ([setup]) or unlock with it (or a fingerprint) on every open.
class PinScreen extends ConsumerStatefulWidget {
  const PinScreen({super.key, required this.setup});

  final bool setup;

  @override
  ConsumerState<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends ConsumerState<PinScreen> with SingleTickerProviderStateMixin {
  String _entered = '';
  String? _first;
  String? _error;
  bool _biometricsAvailable = false;
  bool _biometricsOn = false;
  late final AnimationController _shake =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 380));

  AuthController get _auth => ref.read(authProvider.notifier);

  @override
  void initState() {
    super.initState();
    _initBiometrics();
  }

  Future<void> _initBiometrics() async {
    final available = await _auth.canUseBiometrics();
    final on = widget.setup ? available : await _auth.biometricsEnabled();
    if (!mounted) return;
    setState(() {
      _biometricsAvailable = available;
      _biometricsOn = on;
    });
    if (!widget.setup && available && on) _fingerprint();
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  Future<void> _fingerprint() async {
    final reason = S.of(context).fingerprintReason;
    await _auth.unlockWithBiometrics(reason);
  }

  void _tap(String digit) {
    if (_entered.length >= _pinLength) return;
    HapticFeedback.selectionClick();
    setState(() {
      _error = null;
      _entered += digit;
    });
    if (_entered.length == _pinLength) _complete();
  }

  void _backspace() {
    if (_entered.isEmpty) return;
    setState(() => _entered = _entered.substring(0, _entered.length - 1));
  }

  Future<void> _complete() async {
    final s = S.of(context);
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (widget.setup) {
      if (_first == null) {
        setState(() {
          _first = _entered;
          _entered = '';
        });
        return;
      }
      if (_first == _entered) {
        await _auth.savePin(_entered, biometrics: _biometricsAvailable && _biometricsOn);
        return;
      }
      _fail(s.pinMismatch, restart: true);
      return;
    }
    if (!await _auth.unlock(_entered)) _fail(s.wrongPin);
  }

  void _fail(String message, {bool restart = false}) {
    HapticFeedback.heavyImpact();
    _shake.forward(from: 0);
    setState(() {
      _error = message;
      _entered = '';
      if (restart) _first = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final size = MediaQuery.sizeOf(context);
    final title = widget.setup ? (_first == null ? s.setPin : s.confirmPin) : s.enterPin;
    return Scaffold(
      backgroundColor: Palette.forest,
      body: Stack(
        children: [
          ForestBand(height: size.height, curve: 0),
          SafeArea(
            child: Column(
              children: [
                const Spacer(flex: 2),
                const BrandBadge(size: 64),
                const SizedBox(height: Space.xl),
                Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white)),
                const SizedBox(height: Space.xl),
                AnimatedBuilder(
                  animation: _shake,
                  builder: (context, child) => Transform.translate(
                    offset: Offset(12 * Curves.elasticIn.transform(1 - _shake.value) * (_shake.isAnimating ? 1 : 0), 0),
                    child: child,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (var i = 0; i < _pinLength; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 140),
                          margin: const EdgeInsets.symmetric(horizontal: 10),
                          width: 16,
                          height: 16,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i < _entered.length ? Palette.onForestAccent : Colors.transparent,
                            border: Border.all(color: Palette.onForestMuted, width: 1.6),
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 36,
                  child: Center(
                    child: Text(_error ?? '', style: TextStyle(color: Palette.ochre, fontWeight: FontWeight.w600)),
                  ),
                ),
                if (widget.setup && _biometricsAvailable)
                  SwitchListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: Space.xxl),
                    value: _biometricsOn,
                    onChanged: (v) => setState(() => _biometricsOn = v),
                    activeThumbColor: Palette.onForestAccent,
                    secondary: const Icon(PhosphorIconsRegular.fingerprint, color: Colors.white),
                    title: Text(s.useFingerprint, style: const TextStyle(color: Colors.white)),
                  ),
                const Spacer(),
                _Keypad(
                  onDigit: _tap,
                  onBackspace: _backspace,
                  onFingerprint: !widget.setup && _biometricsAvailable && _biometricsOn ? _fingerprint : null,
                ),
                const SizedBox(height: Space.xl),
                if (!widget.setup)
                  TextButton(
                    onPressed: () => _auth.signOut(),
                    style: TextButton.styleFrom(foregroundColor: Palette.onForestMuted),
                    child: Text(s.signOut),
                  ),
                const SizedBox(height: Space.lg),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBackspace, this.onFingerprint});

  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;
  final VoidCallback? onFingerprint;

  @override
  Widget build(BuildContext context) {
    Widget key(Widget child, VoidCallback? onTap, {String? label}) => SizedBox(
          width: 84,
          height: 68,
          child: onTap == null
              ? null
              : Semantics(
                  button: true,
                  label: label,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onTap,
                    child: Center(child: child),
                  ),
                ),
        );
    Widget digit(String d) => key(
          Text(d, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Colors.white)),
          () => onDigit(d),
          label: d,
        );
    return Column(
      children: [
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ])
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (final d in row) digit(d)]),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            key(const Icon(PhosphorIconsRegular.fingerprint, color: Colors.white, size: 30), onFingerprint,
                label: 'Fingerprint'),
            digit('0'),
            key(const Icon(PhosphorIconsRegular.backspace, color: Colors.white, size: 26), onBackspace,
                label: 'Delete'),
          ],
        ),
      ],
    );
  }
}
