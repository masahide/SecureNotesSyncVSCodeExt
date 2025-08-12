import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";


export default defineConfig([
    globalIgnores(["src/test/.vscode-test/*"]),
	{
        files: ["**/*.ts"],
        plugins: {
            "@typescript-eslint": typescriptEslint,
        },
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2022,
            sourceType: "module",
        },
        rules: {
			"prefer-const": "error",
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }],

            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            semi: "warn",
        },
    },
    // Additional restrictions for production source (exclude tests)
    {
        files: ["src/**/*.ts"],
        ignores: ["src/test/**"],
        rules: {
            // Forbid dynamic import() usage in source to keep DI/static deps
            "no-restricted-syntax": [
                "error",
                {
                    selector: "ImportExpression",
                    message: "dynamic import 禁止（DI/静的依存に統一）",
                },
                {
                    // Disallow vscode.extensions.getExtension(...) access in source
                    selector: "MemberExpression[object.object.name='vscode'][object.property.name='extensions'][property.name='getExtension']",
                    message: "vscode.extensions.getExtension の使用禁止（DI から取得すること）",
                },
            ],
        },
    },
]);
