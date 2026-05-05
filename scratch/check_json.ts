import enTranslations from './src/locales/en.json';

console.log('Navigation key exists:', 'navigation' in enTranslations);
if ('navigation' in enTranslations) {
    console.log('projectsHub exists in navigation:', 'projectsHub' in enTranslations.navigation);
}
