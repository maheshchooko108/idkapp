// The app imports the platform-neutral core from ../shared (also used by the
// Supabase edge functions), so Metro has to watch that folder too.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];
module.exports = config;
