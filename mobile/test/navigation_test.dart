import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:medilink/app/strings.dart';
import 'package:medilink/app/strings_more.dart';
import 'package:medilink/screens/home/notifications_screen.dart';
import 'package:medilink/screens/shell.dart';

Widget _tabs(int index) => MaterialApp(
      home: FadeThroughBranches(
        index: index,
        children: const [Text('home'), Text('care'), Text('visits'), Text('me')],
      ),
    );

void main() {
  testWidgets('going back to Home shows Home, not the tab left behind', (tester) async {
    await tester.pumpWidget(_tabs(0));
    await tester.pumpWidget(_tabs(3));
    await tester.pumpAndSettle();
    expect(find.text('me'), findsOneWidget);
    expect(find.text('home'), findsNothing); // offstage

    await tester.pumpWidget(_tabs(0));
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
    expect(find.text('me'), findsNothing);
    expect(find.text('visits'), findsNothing);
  });

  test('notification links open app pages', () {
    AppNotification n(String? path) => AppNotification.fromJson({
          'id': 'n1',
          'title': 't',
          'body': 'b',
          'priority': 'routine',
          'action_path': path,
          'is_read': false,
          'created_at': '2026-11-05T10:00:00Z',
        });
    expect(n('/pharmacy/prescriptions/42').appRoute, '/me/medications');
    expect(n('/clinical/consultations/7').appRoute, '/me/records');
    expect(n('/notifications/n1').appRoute, isNull);
    // the website's /dashboard paths the API sends since upgrade 12
    const id = '0196f0a1-2b3c-7d4e-8f90-123456789abc';
    expect(n('/dashboard/appointments/$id').appRoute, '/visits/booking/$id');
    expect(n('/dashboard/queue/$id').appRoute, '/visits/ticket/$id');
    expect(n('/dashboard/medications/$id').appRoute, '/me/medications');
    expect(n('/dashboard/documents/$id').appRoute, '/me/documents');
  });

  test('every new label exists in Kinyarwanda and English', () {
    for (final key in ['markAllRead', 'addMember', 'urgency.emergency', 'resetTitle', 'topic.other']) {
      expect(Strings.rw.t(key), isNot(key));
      expect(Strings.en.t(key), isNot(key));
    }
  });
}
