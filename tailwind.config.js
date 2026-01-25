/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx,js,jsx}',
	],
	prefix: "",
	theme: {
		container: {
			center: false,
			padding: '2rem',
			screens: {
				'sm': '100%',
				'md': '100%',
				'lg': '100%',
				'xl': '100%',
				'2xl': '100%'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				// New semantic tokens
				bg: 'var(--bg)',
				'surface-1': 'var(--surface-1)',
				'surface-2': 'var(--surface-2)',
				'text-primary': 'var(--text-primary)',
				'text-secondary': 'var(--text-secondary)',
				'muted-ink': 'var(--muted-ink)',
				'primary-blue': 'var(--primary-blue)',
				gold: 'var(--gold)',
				'border-custom': 'var(--border-custom)',

				// Premium Tokens
				'shadow-card': 'var(--shadow-card)',
				'shadow-glow': 'var(--shadow-glow)',
				'glass-bg': 'var(--glass-bg)',
				'glass-border': 'var(--glass-border)',

				// Folder tokens
				'folder-bg-from': 'var(--folder-bg-from)',
				'folder-bg-to': 'var(--folder-bg-to)',
				'folder-outline': 'var(--folder-outline)',
				'folder-fill': 'var(--folder-fill)',

				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [import("tailwindcss-animate"), require("tailwindcss-animate")],
}
