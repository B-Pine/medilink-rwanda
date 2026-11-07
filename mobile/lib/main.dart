import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quick_actions/quick_actions.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app/config.dart';
import 'app/router.dart';
import 'app/strings.dart';
import 'app/theme.dart';
import 'data/session.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  // Failed loads show Retry; no silent automatic retries (they would repeat 401s and offline calls).
  runApp(ProviderScope(retry: (_, _) => null, child: const MediLinkApp()));
}

class MediLinkApp extends ConsumerStatefulWidget {
  const MediLinkApp({super.key});

  @override
  ConsumerState<MediLinkApp> createState() => _MediLinkAppState();
}

class _MediLinkAppState extends ConsumerState<MediLinkApp> with WidgetsBindingObserver {
  DateTime? _backgroundedAt;
  String? _shortcutsLanguage;
  final _quickActions = const QuickActions();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _quickActions.initialize(_onShortcut);
    Palette.dark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
  }

  /// Dark mode follows the phone, like the staff website. Screens read [Palette] in build, so
  /// every element rebuilds once (state, scroll and the open page stay as they are).
  @override
  void didChangePlatformBrightness() {
    final dark = WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark;
    if (dark == Palette.dark) return;
    Palette.dark = dark;
    setState(() {});
    void rebuild(Element element) {
      element.markNeedsBuild();
      element.visitChildren(rebuild);
    }

    (context as Element).visitChildren(rebuild);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Auto-lock: back from the background after 2 minutes asks for the PIN again.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _backgroundedAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final since = _backgroundedAt;
      _backgroundedAt = null;
      if (since != null && DateTime.now().difference(since) >= AppConfig.autoLockAfter) {
        ref.read(authProvider.notifier).lock();
      }
    }
  }

  /// Holding the app icon: My ticket · Book · Find care · Emergency 912 (upgrade 15 §3).
  /// Emergency calls straight away, without the PIN.
  void _onShortcut(String type) {
    if (type == 'emergency') {
      launchUrl(Uri.parse('tel:${AppConfig.emergencyNumber}'));
      return;
    }
    final route = switch (type) {
      'ticket' => '/visits',
      'book' || 'care' => '/care',
      _ => '/home',
    };
    if (ref.read(authProvider) == AuthPhase.ready) {
      ref.read(routerProvider).go(route);
    } else {
      ref.read(pendingRouteProvider.notifier).set(route);
    }
  }

  void _updateShortcuts(Strings s) {
    if (_shortcutsLanguage == s.code) return;
    _shortcutsLanguage = s.code;
    _quickActions.setShortcutItems([
      ShortcutItem(type: 'ticket', localizedTitle: s.ticket, icon: 'ic_shortcut_ticket'),
      ShortcutItem(type: 'book', localizedTitle: s.book, icon: 'ic_shortcut_book'),
      ShortcutItem(type: 'care', localizedTitle: s.findCare, icon: 'ic_shortcut_care'),
      ShortcutItem(
        type: 'emergency',
        localizedTitle: '${s.emergency} ${AppConfig.emergencyNumber}',
        icon: 'ic_shortcut_emergency',
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final strings = Strings.forCode(ref.watch(languageProvider));
    _updateShortcuts(strings);
    return MaterialApp.router(
      title: 'MediLink',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: router,
      // Material widgets (date and time pickers) have no Kinyarwanda: they use English then; in
      // French they follow. The app's own text follows S.
      locale: Locale(strings.code == 'fr' ? 'fr' : 'en'),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) => S(strings: strings, child: child ?? const SizedBox.shrink()),
    );
  }
}
