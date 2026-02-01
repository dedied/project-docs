import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'FitTrack Pro Docs',
    description: 'Architecture and product documentation',
    markdown: { mermaid: true },
    themeConfig: {
        sidebar: {
            '/fittrack-pro/': [
            {
                text: 'FitTrack Pro',
                items: [
                { text: 'Overview', link: '/fittrack-pro/' },
                { text: 'Architecture', link: '/fittrack-pro/architecture' }
                ]
            }
            ]
        }
    }

});
