import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/session.dart';
import 'theme.dart';
import '../screens/auth/forgot_screen.dart';
import '../screens/auth/pin_screen.dart';
import '../screens/auth/sign_in_screen.dart';
import '../screens/auth/sign_up_screen.dart';
import '../screens/auth/splash_screen.dart';
import '../screens/care/book_screen.dart';
import '../screens/care/care_screen.dart';
import '../screens/care/doctor_screen.dart';
import '../screens/care/facility_screen.dart';
import '../screens/care/map_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/home/notifications_screen.dart';
import '../screens/home/symptoms_screen.dart';
import '../screens/me/family_screen.dart';
import '../screens/me/help_screen.dart';
import '../screens/me/me_screen.dart';
import '../screens/me/privacy_screen.dart';
import '../screens/me/record_lists.dart';
import '../screens/me/health_details.dart';
import '../screens/me/money_disputes.dart';
import '../screens/me/claim_screen.dart';
import '../screens/me/notification_settings_screen.dart';
import '../screens/me/password_screen.dart';
import '../screens/me/profile_screen.dart';
import '../screens/me/settings_screen.dart';
import '../screens/shell.dart';
import '../screens/visits/booking_screen.dart';
import '../screens/visits/ticket_screen.dart';
import '../screens/visits/visits_screen.dart';

const _authRoutes = {'/sign-in', '/sign-up', '/forgot-password'};

/// Pages open whether signed in or not (the privacy notice and terms).
bool _public(String path) => path.startsWith('/legal/');

/// Where an app-icon shortcut asked to go; opened once the app is unlocked.
final pendingRouteProvider = NotifierProvider<PendingRoute, String?>(PendingRoute.new);

class PendingRoute extends Notifier<String?> {
  @override
  String? build() => null;

  // ignore: use_setters_to_change_properties
  void set(String? route) => state = route;
}

final routerProvider = Provider<GoRouter>((ref) {
  final phase = ValueNotifier<AuthPhase>(ref.read(authProvider));
  ref
    ..listen(authProvider, (_, next) => phase.value = next)
    ..onDispose(phase.dispose);

  // Every pushed page uses the theme's one transition (Motion.sharedAxis).
  Page<void> slide(GoRouterState state, Widget child) => CustomTransitionPage<void>(
        key: state.pageKey,
        child: child,
        transitionDuration: Motion.slow,
        reverseTransitionDuration: Motion.normal,
        transitionsBuilder: Motion.sharedAxis,
      );

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: phase,
    redirect: (context, state) {
      final here = state.matchedLocation;
      switch (phase.value) {
        case AuthPhase.starting:
          return here == '/splash' ? null : '/splash';
        case AuthPhase.signedOut:
          return _authRoutes.contains(here) || _public(here) ? null : '/sign-in';
        case AuthPhase.setPin:
          return here == '/pin-setup' ? null : '/pin-setup';
        case AuthPhase.locked:
          return here == '/lock' ? null : '/lock';
        case AuthPhase.ready:
          if (here == '/splash' || here == '/lock' || here == '/pin-setup' || _authRoutes.contains(here)) {
            final pending = ref.read(pendingRouteProvider);
            if (pending != null) {
              Future.microtask(() => ref.read(pendingRouteProvider.notifier).set(null));
              return pending;
            }
            return '/home';
          }
          return null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/sign-up', pageBuilder: (_, state) => slide(state, const SignUpScreen())),
      GoRoute(path: '/forgot-password', pageBuilder: (_, state) => slide(state, const ForgotScreen())),
      GoRoute(
        path: '/legal/:doc',
        pageBuilder: (_, state) => slide(state, LegalScreen(doc: state.pathParameters['doc']!)),
      ),
      GoRoute(path: '/pin-setup', builder: (_, _) => const PinScreen(setup: true)),
      GoRoute(path: '/lock', builder: (_, _) => const PinScreen(setup: false)),
      StatefulShellRoute(
        builder: (context, state, shell) => AppShell(shell: shell),
        navigatorContainerBuilder: (context, shell, children) =>
            FadeThroughBranches(index: shell.currentIndex, children: children),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/home',
              builder: (_, _) => const HomeScreen(),
              routes: [
                GoRoute(path: 'map', pageBuilder: (_, state) => slide(state, const MapScreen())),
                GoRoute(path: 'notifications', pageBuilder: (_, state) => slide(state, const NotificationsScreen())),
                GoRoute(path: 'symptoms', pageBuilder: (_, state) => slide(state, const SymptomsScreen())),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/care',
              builder: (_, _) => const CareScreen(),
              routes: [
                // Before ':slug', so "map" is never read as a facility.
                GoRoute(path: 'map', pageBuilder: (_, state) => slide(state, const MapScreen())),
                GoRoute(
                  path: ':slug',
                  pageBuilder: (_, state) => slide(state, FacilityScreen(slug: state.pathParameters['slug']!)),
                  routes: [
                    GoRoute(
                      path: 'book',
                      pageBuilder: (_, state) => slide(
                        state,
                        BookScreen(
                          slug: state.pathParameters['slug']!,
                          serviceId: state.uri.queryParameters['service'],
                          doctorId: state.uri.queryParameters['doctor'],
                        ),
                      ),
                    ),
                    GoRoute(
                      path: 'doctor/:id',
                      pageBuilder: (_, state) => slide(
                        state,
                        DoctorScreen(slug: state.pathParameters['slug']!, doctorId: state.pathParameters['id']!),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/visits',
              builder: (_, _) => const VisitsScreen(),
              routes: [
                GoRoute(
                  path: 'ticket/:id',
                  pageBuilder: (_, state) => slide(state, TicketScreen(visitId: state.pathParameters['id']!)),
                ),
                GoRoute(
                  path: 'booking/:id',
                  pageBuilder: (_, state) => slide(state, BookingScreen(bookingId: state.pathParameters['id']!)),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/me',
              builder: (_, _) => const MeScreen(),
              routes: [
                GoRoute(
                  path: 'records',
                  pageBuilder: (_, state) => slide(state, const RecordsScreen()),
                  routes: [
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) => slide(state, RecordScreen(recordId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'medications',
                  pageBuilder: (_, state) => slide(state, const MedicationsScreen()),
                  routes: [
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) =>
                          slide(state, MedicationScreen(prescriptionId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'bills',
                  pageBuilder: (_, state) => slide(state, const BillsScreen()),
                  routes: [
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) => slide(state, BillScreen(billId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'disputes',
                  pageBuilder: (_, state) => slide(state, const DisputesScreen()),
                  routes: [
                    // Before ':id', so "new" is never read as a dispute.
                    GoRoute(
                      path: 'new',
                      pageBuilder: (_, state) => slide(
                        state,
                        NewDisputeScreen(
                          subjectType: state.uri.queryParameters['subject_type'] ?? '',
                          subjectId: state.uri.queryParameters['subject_id'] ?? '',
                          patientId: state.uri.queryParameters['patient_id'] ?? '',
                        ),
                      ),
                    ),
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) => slide(state, DisputeScreen(disputeId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
                GoRoute(path: 'documents', pageBuilder: (_, state) => slide(state, const DocumentsScreen())),
                GoRoute(path: 'results', pageBuilder: (_, state) => slide(state, const ResultsScreen())),
                GoRoute(path: 'profile', pageBuilder: (_, state) => slide(state, const MyProfileScreen())),
                GoRoute(path: 'claim', pageBuilder: (_, state) => slide(state, const ClaimScreen())),
                GoRoute(
                  path: 'settings',
                  pageBuilder: (_, state) => slide(state, const SettingsScreen()),
                  routes: [
                    GoRoute(path: 'password', pageBuilder: (_, state) => slide(state, const PasswordScreen())),
                    GoRoute(
                      path: 'notifications',
                      pageBuilder: (_, state) => slide(state, const NotificationSettingsScreen()),
                    ),
                  ],
                ),
                GoRoute(path: 'privacy', pageBuilder: (_, state) => slide(state, const PrivacyScreen())),
                GoRoute(
                  path: 'family',
                  pageBuilder: (_, state) => slide(state, const FamilyScreen()),
                  routes: [
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) => slide(state, ProfileScreen(patientId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'help',
                  pageBuilder: (_, state) => slide(state, const HelpScreen()),
                  routes: [
                    GoRoute(
                      path: ':slug',
                      pageBuilder: (_, state) => slide(state, ArticleScreen(slug: state.pathParameters['slug']!)),
                    ),
                  ],
                ),
                GoRoute(
                  path: 'support',
                  pageBuilder: (_, state) => slide(state, const SupportListScreen()),
                  routes: [
                    GoRoute(path: 'new', pageBuilder: (_, state) => slide(state, const NewSupportScreen())),
                    GoRoute(
                      path: ':id',
                      pageBuilder: (_, state) => slide(state, SupportThreadScreen(requestId: state.pathParameters['id']!)),
                    ),
                  ],
                ),
              ],
            ),
          ]),
        ],
      ),
    ],
  );
});
