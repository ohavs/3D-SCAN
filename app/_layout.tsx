import '../src/lib/polyfills';
import 'react-native-gesture-handler';
import React from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { SessionProvider } from '../src/session/SessionContext';
import { ProjectsProvider } from '../src/store/projects';
import { colors } from '../src/ui/theme';

// Force RTL so the whole UI lays out right-to-left for Hebrew.
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ProjectsProvider>
          <SessionProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            />
          </SessionProvider>
        </ProjectsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
