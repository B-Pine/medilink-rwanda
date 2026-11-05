// Renders app screens with sample data to PNG files, to review the design without a phone.
// Not part of CI (outside test/). Run:  flutter test test_screens --dart-define=SHOTS=<folder>
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:medilink/app/strings.dart';
import 'package:medilink/app/theme.dart';
import 'package:latlong2/latlong.dart';
import 'package:medilink/data/location.dart';
import 'package:medilink/data/models.dart';
import 'package:medilink/data/providers.dart';
import 'package:medilink/screens/care/book_screen.dart';
import 'package:medilink/screens/care/care_screen.dart';
import 'package:medilink/screens/care/doctor_screen.dart';
import 'package:medilink/screens/care/facility_screen.dart';
import 'package:medilink/screens/care/map_screen.dart';
import 'package:medilink/screens/home/home_screen.dart';

import 'sample.dart';

const _out = String.fromEnvironment('SHOTS');

class _Here extends LocationController {
  _Here(this.point);
  final LatLng? point;
  @override
  Located build() => Located(point: point);
}

Future<void> _loadFonts() async {
  const families = {
    'Inter': ['Inter-400', 'Inter-500', 'Inter-600', 'Inter-700'],
    'Figtree': ['Figtree-500', 'Figtree-600', 'Figtree-700', 'Figtree-800'],
    'PhosphorRegular': ['Phosphor-Regular'],
    'PhosphorFill': ['Phosphor-Fill'],
    'PhosphorBold': ['Phosphor-Bold'],
  };
  for (final entry in families.entries) {
    final loader = FontLoader(entry.key);
    for (final file in entry.value) {
      loader.addFont(rootBundle.load('assets/fonts/$file.ttf'));
    }
    await loader.load();
  }
}

Future<void> _shoot(
  WidgetTester tester,
  String name,
  Widget screen,
  List<dynamic> overrides, {
  String lang = 'rw',
  Future<void> Function(WidgetTester)? act,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  final key = GlobalKey();
  final router = GoRouter(
    initialLocation: '/x',
    routes: [GoRoute(path: '/x', builder: (_, _) => screen)],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [...overrides],
      retry: (_, _) => null,
      child: RepaintBoundary(
        key: key,
        child: MaterialApp.router(
          theme: buildTheme(),
          debugShowCheckedModeBanner: false,
          routerConfig: router,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(padding: const EdgeInsets.only(top: 32), disableAnimations: true),
            child: S(strings: Strings.forCode(lang), child: child!),
          ),
        ),
      ),
    ),
  );
  for (var i = 0; i < 8; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    await tester.pump(const Duration(milliseconds: 400));
  }
  if (act != null) await act(tester);
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$_out/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
  });
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  setUpAll(_loadFonts);

  final base = [
    meProvider.overrideWith((ref) async => sampleMe),
    unreadProvider.overrideWith((ref) async => 3),
    facilitySearchProvider.overrideWith((ref, q) async => sampleFacilities),
    locationProvider.overrideWith(() => _Here(const LatLng(-1.95, 30.09))),
  ];
  final noLocation = [
    meProvider.overrideWith((ref) async => sampleMe),
    unreadProvider.overrideWith((ref) async => 0),
    facilitySearchProvider.overrideWith((ref, q) async => sampleFacilities),
    locationProvider.overrideWith(() => _Here(null)),
  ];

  testWidgets('home with a ticket', (tester) async {
    await _shoot(tester, 'home-ticket', const HomeScreen(), [
      ...base,
      activeVisitsProvider.overrideWith((ref) async => Cached([sampleVisit])),
      bookingsProvider.overrideWith((ref, when) async => Cached(sampleBookings)),
    ]);
  }, skip: _out.isEmpty);

  testWidgets('home, next visit', (tester) async {
    await _shoot(tester, 'home-next', const HomeScreen(), [
      ...base,
      activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
      bookingsProvider.overrideWith((ref, when) async => Cached(sampleBookings)),
    ], lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('home, nothing planned, no location', (tester) async {
    await _shoot(tester, 'home-empty', const HomeScreen(), [
      ...noLocation,
      activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
      bookingsProvider.overrideWith((ref, when) async => const Cached(<Booking>[])),
    ]);
  }, skip: _out.isEmpty);

  testWidgets('map', (tester) async {
    await _shoot(tester, 'map', const MapScreen(), base);
  }, skip: _out.isEmpty);

  testWidgets('home, nothing planned (scrolled)', (tester) async {
    await _shoot(
      tester,
      'home-empty-scrolled',
      const HomeScreen(),
      [
        ...base,
        activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
        bookingsProvider.overrideWith((ref, when) async => const Cached(<Booking>[])),
      ],
      act: (tester) async {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -620));
        await tester.pump(const Duration(milliseconds: 500));
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('care', (tester) async {
    await _shoot(tester, 'care', const CareScreen(), [...base, activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[]))]);
  }, skip: _out.isEmpty);

  final facility = [
    ...base,
    facilityProvider.overrideWith((ref, slug) async => sampleFacility),
    slotsProvider.overrideWith((ref, q) async => sampleSlots),
    symptomsProvider.overrideWith((ref) async => sampleSymptoms),
  ];

  for (final lang in ['rw', 'en']) {
    testWidgets('doctor ($lang)', (tester) async {
      await _shoot(tester, 'doctor-$lang', const DoctorScreen(slug: 'kibagabaga-hospital', doctorId: 'm-1'), facility,
          lang: lang);
    }, skip: _out.isEmpty);
  }

  testWidgets('doctor (scrolled)', (tester) async {
    await _shoot(
      tester,
      'doctor-scrolled',
      const DoctorScreen(slug: 'kibagabaga-hospital', doctorId: 'm-1'),
      facility,
      lang: 'en',
      act: (tester) async {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump(const Duration(milliseconds: 300)); // let the bar title fade in
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('facility', (tester) async {
    await _shoot(tester, 'facility', const FacilityScreen(slug: 'kibagabaga-hospital'), facility, lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('book with a doctor', (tester) async {
    await _shoot(
      tester,
      'book-doctor',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp', doctorId: 'm-1'),
      facility,
      lang: 'en',
    );
  }, skip: _out.isEmpty);

  testWidgets('book confirm sheet', (tester) async {
    await _shoot(
      tester,
      'book-confirm',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp'),
      facility,
      lang: 'en',
      act: (tester) async {
        await tester.tap(find.text('08:00'));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.tap(find.text('Chest pain'));
        await tester.tap(find.text('Fever'));
        await tester.pump(const Duration(milliseconds: 300));
      },
    );
  }, skip: _out.isEmpty);
}
