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
      // google-services.json è escluso da git: su una macchina senza il file (CI, nuovo PC) la build EAS
      // può usare una variabile d'ambiente EAS di tipo file chiamata GOOGLE_SERVICES_JSON.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",

      config: {
        ...(baseConfig.expo.android?.config || {}),

        googleMaps: {
          ...(baseConfig.expo.android?.config?.googleMaps || {}),
          apiKey: googleMapsApiKey,
        },
      },
    },

    // versionCode (Android) e buildNumber (iOS) vivono solo in app.base.json:
    // eas.json usa appVersionSource "local", quindi vanno incrementati lì prima di ogni build.
  };
};
