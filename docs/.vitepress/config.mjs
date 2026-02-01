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
                    { text: 'Architecture', link: '/architecture' },
                    { text: 'Database', link: '/database' },
                    { text: 'Hosting', link: '/hosting' },
                    { text: 'Payment', link: '/payment' },
                    { text: 'Testing', link: '/testing' }
                ]
            }
            ]
        },
        outline: [2, 6]
    }
});
