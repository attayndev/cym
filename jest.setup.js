// AsyncStorage ships a jest mock but doesn't register it automatically.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
