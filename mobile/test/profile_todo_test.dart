import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:medilink/app/strings.dart';
import 'package:medilink/app/strings_more.dart';
import 'package:medilink/app/theme.dart';
import 'package:medilink/data/profile.dart';
import 'package:medilink/data/providers.dart';
import 'package:medilink/screens/me/profile_screen.dart';

import '../test_screens/sample.dart';

/// 2026-11-08: the "+" steps on the profile to-do open the form for that step (they did nothing;
/// people had to find the section's Edit).
void main() {
  setUp(() {
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    for (final channel in ['rw.medilink/secure', 'plugins.it_nomads.com/flutter_secure_storage']) {
      messenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => null);
    }
  });

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: '/x',
      routes: [GoRoute(path: '/x', builder: (_, _) => const ProfileScreen(patientId: 'p1'))],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          meProvider.overrideWith((ref) async => sampleMe),
          profileDetailProvider.overrideWith((ref, id) async => sampleProfile),
          identifiersProvider.overrideWith((ref, id) async => sampleIdentifiers),
          insuranceProvider.overrideWith((ref, id) async => sampleInsurance),
          healthProvider.overrideWith((ref, id) async => sampleHealth),
          photoUrlProvider.overrideWith((ref, id) async => null),
        ],
        retry: (_, _) => null,
        child: MaterialApp.router(
          theme: buildTheme(),
          routerConfig: router,
          builder: (context, child) => S(strings: Strings.en, child: child!),
        ),
      ),
    );
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  testWidgets('the emergency contact step opens the emergency contact form', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const ValueKey('todo-emergency_contact')));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.descendant(of: find.byType(BottomSheet), matching: find.text(Strings.en.t('emergencyContact'))),
        findsWidgets);
  });

  testWidgets('the allergies step opens the allergy form with "no known allergies"', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const ValueKey('todo-allergies_reviewed')));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(find.byKey(const ValueKey('no-known-allergies')), findsOneWidget);
  });
}
