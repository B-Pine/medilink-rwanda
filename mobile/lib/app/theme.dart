import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// MediLink colours (docs/upgrade/15-mobile-app.md §1): the website palette, nothing new.
abstract final class Palette {
  static const forest = Color(0xFF123D2B);
  static const forestRaised = Color(0xFF1A4D37);
  static const brand = Color(0xFF17694D);
  static const brandPressed = Color(0xFF0F4F3A);
  static const brandSubtle = Color(0xFFE7F3ED);
  static const onForestMuted = Color(0xFFB9D6C4);
  static const onForestAccent = Color(0xFF6EE7B7);
  static const ochre = Color(0xFFFBBF24);
  static const ochreText = Color(0xFF8A5A00);
  static const page = Color(0xFFF6F8F7);
  static const surface = Color(0xFFFFFFFF);
  static const ink = Color(0xFF14231C);
  static const muted = Color(0xFF5B6B63);
  static const hairline = Color(0xFFE3E9E6);
  static const skeleton = Color(0xFFE9EEEB);
  static const danger = Color(0xFFB42318);
  static const dangerSubtle = Color(0xFFFDECEA);
}

abstract final class Fonts {
  static const heading = 'Figtree';
  static const body = 'Inter';
}

/// Spacing scale (4-pt grid) and radii. Small radii, as on the website.
abstract final class Space {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
  static const radius = 12.0;
  static const radiusSm = 8.0;
}

ThemeData buildTheme() {
  const scheme = ColorScheme.light(
    primary: Palette.brand,
    onPrimary: Colors.white,
    primaryContainer: Palette.brandSubtle,
    onPrimaryContainer: Palette.forest,
    secondary: Palette.forest,
    onSecondary: Colors.white,
    tertiary: Palette.ochre,
    error: Palette.danger,
    onError: Colors.white,
    surface: Palette.surface,
    onSurface: Palette.ink,
    onSurfaceVariant: Palette.muted,
    outline: Palette.hairline,
    outlineVariant: Palette.hairline,
  );

  TextStyle h(double size, FontWeight weight, {double height = 1.2}) => TextStyle(
        fontFamily: Fonts.heading,
        fontSize: size,
        fontWeight: weight,
        height: height,
        color: Palette.ink,
        letterSpacing: -0.2,
      );
  TextStyle b(double size, FontWeight weight, {Color color = Palette.ink}) => TextStyle(
        fontFamily: Fonts.body,
        fontSize: size,
        fontWeight: weight,
        height: 1.4,
        color: color,
      );

  final text = TextTheme(
    displayLarge: h(44, FontWeight.w800, height: 1.0),
    displayMedium: h(34, FontWeight.w800, height: 1.05),
    headlineMedium: h(26, FontWeight.w700),
    headlineSmall: h(22, FontWeight.w700),
    titleLarge: h(19, FontWeight.w700),
    titleMedium: h(16, FontWeight.w600),
    titleSmall: h(14, FontWeight.w600),
    bodyLarge: b(16, FontWeight.w400),
    bodyMedium: b(14, FontWeight.w400),
    bodySmall: b(12.5, FontWeight.w400, color: Palette.muted),
    labelLarge: b(15, FontWeight.w600),
    labelMedium: b(13, FontWeight.w500, color: Palette.muted),
    labelSmall: b(11.5, FontWeight.w600, color: Palette.muted),
  );

  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius));

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Palette.page,
    fontFamily: Fonts.body,
    textTheme: text,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: Palette.forest,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      titleTextStyle: h(18, FontWeight.w700).copyWith(color: Colors.white),
    ),
    cardTheme: CardThemeData(
      color: Palette.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: shape.copyWith(side: const BorderSide(color: Palette.hairline)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: shape,
        textStyle: b(16, FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: shape,
        side: const BorderSide(color: Palette.hairline),
        foregroundColor: Palette.ink,
        textStyle: b(16, FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: Palette.brand, textStyle: b(15, FontWeight.w600)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Palette.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.lg),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Space.radius),
        borderSide: const BorderSide(color: Palette.hairline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Space.radius),
        borderSide: const BorderSide(color: Palette.hairline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Space.radius),
        borderSide: const BorderSide(color: Palette.brand, width: 1.6),
      ),
      labelStyle: b(15, FontWeight.w400, color: Palette.muted),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Palette.surface,
      indicatorColor: Palette.brandSubtle,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => b(12, FontWeight.w600,
            color: s.contains(WidgetState.selected) ? Palette.brand : Palette.muted),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Palette.surface,
      showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    ),
    dividerTheme: const DividerThemeData(color: Palette.hairline, space: 1, thickness: 1),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: PredictiveBackPageTransitionsBuilder()},
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Palette.forest,
      contentTextStyle: b(14, FontWeight.w500, color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radiusSm)),
    ),
  );
}
