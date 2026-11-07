import 'package:flutter/material.dart';

import '../app/theme.dart';
import 'heartbeat_refresh.dart';

/// A sub-page (Profile, Family, settings, records…): a light header with a large title that
/// collapses into a standard bar on scroll. No dark band; the bands belong to the main tabs.
class SubPage extends StatelessWidget {
  const SubPage({
    super.key,
    required this.title,
    this.children,
    this.slivers,
    this.padding = const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.xxl),
    this.actions,
    this.bottomBar,
    this.onRefresh,
    this.busy = false,
    this.backgroundColor = Palette.page,
  }) : assert(children != null || slivers != null);

  final String title;

  /// The page content as a padded list…
  final List<Widget>? children;

  /// …or as slivers, after the header.
  final List<Widget>? slivers;
  final EdgeInsetsGeometry padding;
  final List<Widget>? actions;

  /// Usually a [BottomActionBar].
  final Widget? bottomBar;
  final RefreshCallback? onRefresh;

  /// A thin progress line under the bar (saving).
  final bool busy;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    final scroll = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverAppBar.large(
          title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: actions,
          bottom: busy
              ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2))
              : null,
        ),
        if (children != null) SliverPadding(padding: padding, sliver: SliverList.list(children: children!)),
        ...?slivers,
      ],
    );
    return Scaffold(
      backgroundColor: backgroundColor,
      body: onRefresh == null ? scroll : HeartbeatRefresh(onRefresh: onRefresh!, child: scroll),
      bottomNavigationBar: bottomBar,
    );
  }
}
