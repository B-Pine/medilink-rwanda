import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';

import '../../app/strings.dart';
import '../../app/strings_more.dart';
import '../../app/theme.dart';
import '../../data/profile.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/band.dart';
import '../../ui/feedback.dart';
import 'profile_screen.dart';

/// Everything a sidebar would hold, as one clean list under the profile (upgrade 15 §1).
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final me = ref.watch(meProvider).value;
    final top = MediaQuery.paddingOf(context).top;

    final selfId = me?.profiles.where((p) => p.relationship == 'self').firstOrNull?.patientId;
    final self = selfId == null ? null : ref.watch(profileDetailProvider(selfId)).value;

    final mine = [
      (s.t('myProfile'), PhosphorIconsRegular.userCircle, () => context.go('/me/profile')),
      (s.t('notificationSettings'), PhosphorIconsRegular.bell, () => context.go('/me/settings/notifications')),
      (s.t('claimTitle'), PhosphorIconsRegular.identificationCard, () => context.go('/me/claim')),
    ];
    final health = [
      (s.records, PhosphorIconsRegular.clipboardText, () => context.go('/me/records')),
      (s.medications, PhosphorIconsRegular.pill, () => context.go('/me/medications')),
      (s.results, PhosphorIconsRegular.flask, () => context.go('/me/results')),
      (s.documents, PhosphorIconsRegular.fileText, () => context.go('/me/documents')),
      (s.family, PhosphorIconsRegular.usersThree, () => context.go('/me/family')),
    ];
    final account = [
      (s.privacy, PhosphorIconsRegular.shieldCheck, () => context.go('/me/privacy')),
      (s.help, PhosphorIconsRegular.question, () => context.go('/me/help')),
      (s.settings, PhosphorIconsRegular.gearSix, () => context.go('/me/settings')),
    ];

    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Stack(
            children: [
              ForestBand(height: 170 + top),
              Padding(
                padding: EdgeInsets.fromLTRB(Space.xl, top + Space.xl, Space.xl, 0),
                child: Row(
                  children: [
                    if (selfId == null || me == null)
                      const CircleAvatar(radius: 30, backgroundColor: Palette.forestRaised)
                    else
                      ProfilePhoto(
                        patientId: selfId,
                        name: me.fullName,
                        hasPhoto: self?.hasPhoto ?? false,
                        size: 60,
                        editable: true,
                        onTap: () => context.go('/me/profile'),
                      ),
                    const SizedBox(width: Space.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (me == null)
                            const Skeleton(width: 150, height: 20, onForest: true)
                          else
                            Text(
                              me.fullName,
                              style: theme.textTheme.titleLarge?.copyWith(color: Colors.white),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          const SizedBox(height: 4),
                          Text(
                            me?.email ?? '',
                            style: theme.textTheme.bodySmall?.copyWith(color: Palette.onForestMuted),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (self != null && self.percent < 100) _CompleteBanner(percent: self.percent),
          _Group(items: mine),
          _Group(items: health),
          _Group(items: account),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.xxl),
            child: Card(
              child: ListTile(
                leading: const Icon(PhosphorIconsRegular.signOut, color: Palette.danger),
                title: Text(s.signOut, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w600)),
                onTap: () async {
                  if (await confirmDanger(context, title: s.signOutConfirm, action: s.signOut)) {
                    await ref.read(authProvider.notifier).signOut();
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Complete your profile": what the website said, now done here.
class _CompleteBanner extends StatelessWidget {
  const _CompleteBanner({required this.percent});
  final int percent;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 0),
      child: SoftCard(
        onTap: () => context.go('/me/profile'),
        color: Palette.brandSubtle,
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Row(
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    CircularProgressIndicator(
                      value: percent / 100,
                      strokeWidth: 4,
                      backgroundColor: Colors.white,
                      strokeCap: StrokeCap.round,
                    ),
                    Center(child: Text('$percent%', style: theme.textTheme.labelSmall)),
                  ],
                ),
              ),
              const SizedBox(width: Space.md),
              Expanded(child: Text(s.t('profileTodo'), style: theme.textTheme.titleSmall)),
              const Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.brand),
            ],
          ),
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.items});

  final List<(String, IconData, VoidCallback)> items;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(Space.lg, Space.lg, Space.lg, 0),
      child: Card(
        child: Column(
          children: [
            for (final (i, (label, icon, onTap)) in items.indexed) ...[
              if (i > 0) const Divider(indent: 56),
              ListTile(
                leading: Icon(icon, color: Palette.brand),
                title: Text(label, style: Theme.of(context).textTheme.titleSmall),
                trailing: const Icon(PhosphorIconsRegular.caretRight, size: 18, color: Palette.muted),
                onTap: onTap,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
