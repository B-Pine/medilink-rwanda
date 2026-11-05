import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/app/format.dart' as fmt;
import 'package:medilink/app/strings.dart';
import 'package:medilink/data/models.dart';
import 'package:medilink/ui/feedback.dart';

void main() {
  group('format', () {
    test('24-hour time', () => expect(fmt.time(DateTime(2026, 11, 5, 9, 5)), '09:05'));

    test('wait range', () {
      expect(fmt.waitRange(12, 20, Strings.en), '12–20 min');
      expect(fmt.waitRange(null, 15, Strings.rw), '15 iminota');
      expect(fmt.waitRange(null, null, Strings.en), isNull);
    });

    test('days in Kinyarwanda', () {
      expect(fmt.day(DateTime(2030, 1, 7), Strings.rw), 'Ku wa mbere 7 Mutarama 2030');
      expect(fmt.day(DateTime.now(), Strings.rw), Strings.rw.today);
    });
  });

  group('strings', () {
    test('picks the language from an API map, then English', () {
      expect(Strings.rw.pick({'rw': 'Ubuvuzi rusange', 'en': 'General'}), 'Ubuvuzi rusange');
      expect(Strings.rw.pick({'en': 'General'}), 'General');
      expect(Strings.en.pick(null), '');
    });

    test('state labels fall back to the code', () {
      expect(Strings.en.state('called'), 'Your turn');
      expect(Strings.en.state('unknown_state'), 'unknown_state');
    });
  });

  group('models', () {
    test('active visit from the API shape', () {
      final v = ActiveVisit.fromJson({
        'visit_id': 'v1',
        'facility_name': 'Remera Health Centre',
        'service_name_i18n': {'en': 'General'},
        'ticket_number': 'A-024',
        'state': 'called',
        'ahead': 0,
        'estimate': {'min': null, 'max': null},
        'version': 3,
      });
      expect(v.ticket, 'A-024');
      expect(v.isCalled, isTrue);
      expect(v.estimate.max, isNull);
    });

    test('lists come bare or paginated', () {
      expect(resultsOf([{'a': 1}]), hasLength(1));
      expect(resultsOf({'results': [{'a': 1}, {'a': 2}]}), hasLength(2));
      expect(resultsOf(null), isEmpty);
    });

    test('initials and first name', () {
      final me = Me.fromJson({'id': 'u', 'full_name': 'Mukamana Jeanne', 'profiles': <Object>[]});
      expect(me.initials, 'MJ');
      expect(me.firstName, 'Jeanne');
    });
  });

  testWidgets('empty state shows one line and its action', (tester) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EmptyState(icon: Icons.info, text: 'No visits yet', action: 'Book', onAction: () => tapped = true),
        ),
      ),
    );
    expect(find.text('No visits yet'), findsOneWidget);
    await tester.tap(find.text('Book'));
    expect(tapped, isTrue);
  });
}
