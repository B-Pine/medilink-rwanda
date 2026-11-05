import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../ui/icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/config.dart';
import '../../app/strings.dart';
import '../../app/theme.dart';
import '../../data/providers.dart';
import '../../data/session.dart';
import '../../ui/band.dart';
import '../../ui/feedback.dart';

/// Everything a sidebar would hold, as one clean list under the profile (upgrade 15 §1).
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final me = ref.watch(meProvider).value;
    final top = MediaQuery.paddingOf(context).top;

    void web(String path) =>
        launchUrl(Uri.parse('${AppConfig.webBaseUrl}$path'), mode: LaunchMode.externalApplication);

    final health = [
      (s.records, PhosphorIconsRegular.clipboardText, () => context.go('/me/records')),
      (s.medications, PhosphorIconsRegular.pill, () => context.go('/me/medications')),
      (s.results, PhosphorIconsRegular.flask, () => context.go('/me/results')),
      (s.documents, PhosphorIconsRegular.fileText, () => context.go('/me/documents')),
      (s.family, PhosphorIconsRegular.usersThree, () => web('/dashboard/family')),
    ];
    final account = [
      (s.privacy, PhosphorIconsRegular.shieldCheck, () => web('/dashboard/privacy')),
      (s.help, PhosphorIconsRegular.question, () => web('/help')),
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
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: Palette.forestRaised,
                      child: me == null
                          ? null
                          : Text(me.initials, style: theme.textTheme.titleLarge?.copyWith(color: Palette.onForestAccent)),
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
