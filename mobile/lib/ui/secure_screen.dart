import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Blocks screenshots and the app-switcher preview while [child] is shown (FLAG_SECURE on
/// Android): records, medications, documents and results (upgrade 15 §4).
class SecureScreen extends StatefulWidget {
  const SecureScreen({super.key, required this.child});

  final Widget child;

  static const _channel = MethodChannel('rw.medilink/secure');
  static int _depth = 0;

  static Future<void> _set(bool on) async {
    try {
      await _channel.invokeMethod<void>('setSecure', on);
    } on MissingPluginException {
      // Not Android (tests): nothing to do.
    } on PlatformException {
      // Never block the screen on this.
    }
  }

  @override
  State<SecureScreen> createState() => _SecureScreenState();
}

class _SecureScreenState extends State<SecureScreen> {
  @override
  void initState() {
    super.initState();
    if (SecureScreen._depth++ == 0) SecureScreen._set(true);
  }

  @override
  void dispose() {
    if (--SecureScreen._depth == 0) SecureScreen._set(false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
