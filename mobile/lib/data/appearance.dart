import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Light or dark: like the phone (default), or always light, or always dark. Kept on this phone.
enum Appearance { system, light, dark }

final appearanceProvider = NotifierProvider<AppearanceController, Appearance>(AppearanceController.new);

class AppearanceController extends Notifier<Appearance> {
  static const _key = 'appearance';

  @override
  Appearance build() {
    SharedPreferences.getInstance().then((prefs) {
      final saved = Appearance.values.where((a) => a.name == prefs.getString(_key)).firstOrNull;
      if (saved != null && saved != state) state = saved;
    });
    return Appearance.system;
  }

  Future<void> set(Appearance value) async {
    state = value;
    (await SharedPreferences.getInstance()).setString(_key, value.name);
  }
}
