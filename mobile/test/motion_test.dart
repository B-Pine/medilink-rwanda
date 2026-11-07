import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/app/theme.dart';
import 'package:medilink/ui/controls.dart';

Widget _app(Widget child, {required bool still}) => MaterialApp(
      theme: buildTheme(),
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: still),
          child: Scaffold(body: Center(child: child)),
        ),
      ),
    );

void main() {
  testWidgets('a changing number rolls in', (tester) async {
    await tester.pumpWidget(_app(const Rolling(value: 3, child: Text('3')), still: false));
    await tester.pumpWidget(_app(const Rolling(value: 2, child: Text('2')), still: false));
    await tester.pump(const Duration(milliseconds: 50));
    // Both numbers are on screen while the new one rolls up.
    expect(find.text('3'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('3'), findsNothing);
  });

  testWidgets('with animations off the number swaps at once', (tester) async {
    await tester.pumpWidget(_app(const Rolling(value: 3, child: Text('3')), still: true));
    await tester.pumpWidget(_app(const Rolling(value: 2, child: Text('2')), still: true));
    await tester.pump();
    expect(find.text('3'), findsNothing);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('a pressed card shrinks a little, at once when animations are off', (tester) async {
    for (final still in [false, true]) {
      await tester.pumpWidget(_app(SoftCard(onTap: () {}, child: const SizedBox(width: 200, height: 100)), still: still));
      final gesture = await tester.startGesture(tester.getCenter(find.byType(SoftCard)));
      await tester.pump(const Duration(milliseconds: 200));
      final scale = tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale;
      expect(scale, 0.98);
      expect(tester.widget<AnimatedScale>(find.byType(AnimatedScale)).duration, still ? Duration.zero : Motion.fast);
      await gesture.up();
      await tester.pumpAndSettle();
    }
  });
}
