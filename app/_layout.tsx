import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { SessionProvider } from '../src/session/SessionContext';
import { colors } from '../src/ui/theme';

// Force RTL so the whole UI lays out right-to-left for Hebrew.
I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  useEffect(() => {
    // no-op; reserved for future startup tasks (asset preload, etc.)
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="permissions" />
            <Stack.Screen name="calibrate" />
            <Stack.Screen name="capture" />
            <Stack.Screen name="review" />
          </Stack>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
