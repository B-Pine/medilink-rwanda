import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/icons.dart';

import '../app/strings.dart';
import '../app/theme.dart';
import '../data/providers.dart';

/// Four tabs at the bottom (upgrade 15 §1); a navigation rail on tablets.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _go(int index) => shell.goBranch(index, initialLocation: index == shell.currentIndex);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final hasTicket = ref.watch(activeVisitsProvider).value?.data.isNotEmpty ?? false;
    final items = [
      (s.home, PhosphorIconsRegular.house, PhosphorIconsFill.house, false),
      (s.care, PhosphorIconsRegular.firstAidKit, PhosphorIconsFill.firstAidKit, false),
      (s.visits, PhosphorIconsRegular.ticket, PhosphorIconsFill.ticket, hasTicket),
      (s.me, PhosphorIconsRegular.userCircle, PhosphorIconsFill.userCircle, false),
    ];
    Widget icon(IconData data, bool dot) => Badge(
          isLabelVisible: dot,
          smallSize: 8,
          backgroundColor: Palette.brand,
          child: Icon(data),
        );

    if (MediaQuery.sizeOf(context).width >= 720) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: shell.currentIndex,
              onDestinationSelected: _go,
              labelType: NavigationRailLabelType.all,
              indicatorColor: Palette.brandSubtle,
              destinations: [
                for (final (label, off, on, dot) in items)
                  NavigationRailDestination(
                    icon: icon(off, dot),
                    selectedIcon: icon(on, dot),
                    label: Text(label),
                  ),
              ],
            ),
            const VerticalDivider(),
            Expanded(child: shell),
          ],
        ),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Palette.hairline))),
        child: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: _go,
          destinations: [
            for (final (label, off, on, dot) in items)
              NavigationDestination(
                icon: icon(off, dot),
                selectedIcon: icon(on, dot).withColor(Palette.brand),
                label: label,
              ),
          ],
        ),
      ),
    );
  }
}

extension on Widget {
  Widget withColor(Color color) => IconTheme.merge(data: IconThemeData(color: color), child: this);
}

/// Keeps every tab alive and fades through when switching (200 ms), no sideways slide.
class FadeThroughBranches extends StatelessWidget {
  const FadeThroughBranches({super.key, required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        for (var i = 0; i < children.length; i++)
          IgnorePointer(
            ignoring: i != index,
            child: TickerMode(
              enabled: i == index,
              child: AnimatedOpacity(
                opacity: i == index ? 1 : 0,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOut,
                child: AnimatedScale(
                  scale: i == index ? 1 : 0.985,
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOut,
                  child: Offstage(offstage: false, child: children[i]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
