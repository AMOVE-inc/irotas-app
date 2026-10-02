module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.component.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1",
  },
  clearMocks: true,
};
