const baseConfig = require('./app.base.json');

module.exports = () => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

  return {
    ...baseConfig.expo,

    plugins: (baseConfig.expo.plugins || []).filter((plugin) => {
      if (typeof plugin === 'string') {
        return plugin !== 'react-native-maps';
      }

      return plugin?.[0] !== 'react-native-maps';
    }),

    android: {
      ...baseConfig.expo.android,

      config: {
        ...(baseConfig.expo.android?.config || {}),

        googleMaps: {
          ...(baseConfig.expo.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey,
        },
      },

      versionCode: 6,
    },
  };
};
