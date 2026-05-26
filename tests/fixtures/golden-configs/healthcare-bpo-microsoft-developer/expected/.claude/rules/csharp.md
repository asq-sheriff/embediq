---
description: C# / .NET conventions
paths:
  - "**/*.cs"
  - "**/*.csproj"
  - "**/*.fs"
---

# C# / .NET Conventions

- Target the current LTS .NET (net8.0 or net9.0); enable nullable reference types globally
- Use `record` types for immutable value objects; prefer `sealed` on classes by default
- Use `async`/`await` end-to-end; avoid `.Result` and `.Wait()` (deadlocks)
- Use `IAsyncEnumerable<T>` for streaming sequences instead of `Task<List<T>>`
- Validate input at API boundaries with `ArgumentNullException.ThrowIfNull` (.NET 6+)
- Use `dotnet format` and StyleCop / EditorConfig for consistent style
- Run `dotnet test` on every change; track coverage with coverlet