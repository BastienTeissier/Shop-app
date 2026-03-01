import type { Preview } from "@storybook/react";
import "../src/index.css";

const preview: Preview = {
	decorators: [
		(Story) => (
			<>
				<style>{`
					*, *::before, *::after {
						animation-duration: 0s !important;
						animation-delay: 0s !important;
						transition-duration: 0s !important;
						transition-delay: 0s !important;
					}
				`}</style>
				<Story />
			</>
		),
	],
};

export default preview;
