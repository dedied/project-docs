import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'FitTrack Pro Docs',
    description: 'Architecture and product documentation',
    themeConfig: {
        sidebar: {
            '/': [
            {
                text: 'FitTrack Pro',
                items: [
                { text: 'Architecture', link: '/architecture' }
                ]
            }
            ]
        }
    }
});
