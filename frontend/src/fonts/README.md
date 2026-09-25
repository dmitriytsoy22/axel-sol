# Fonts

All fonts are self-hosted through `next/font/local`, so the build never calls Google Fonts.
Each file is a variable WOFF2 subset. The subset covers Latin, Latin-1, Latin Extended-A, the full
Cyrillic block (Russian and Kazakh: Ә Ғ Қ Ң Ө Ұ Ү Һ І), general punctuation, currency signs
including ₸, arrows and a few math signs.

| File                           | Role                               | Source                                                        | License                            | Changes                                                                                                                                                                                |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Onest-Variable.woff2`         | Body and UI text, numbers (`tnum`) | [Onest](https://github.com/simpals/onest)                     | [OFL-1.1](./OFL-Onest.txt)         | Weight axis limited to 400–700, subset                                                                                                                                                 |
| `AxelSerif-Variable.woff2`     | Display headlines (32 px and up)   | [Source Serif 4](https://github.com/adobe-fonts/source-serif) | [OFL-1.1](./OFL-SourceSerif4.txt)  | Weight axis limited to 400–600, optical size fixed at 40, subset. Renamed "Axel Serif" because the original carries the Reserved Font Name "Source" and a subset is a modified version |
| `JetBrainsMono-Variable.woff2` | Addresses, hashes, mints           | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono)  | [OFL-1.1](./OFL-JetBrainsMono.txt) | Weight axis limited to 400–600, Latin-only subset. It has no Kazakh glyphs, so never use it for prose                                                                                  |

The subsets were made with `fontTools` (`varLib.instancer` and `pyftsubset`). To add glyphs,
re-run the subset from the upstream variable fonts with a wider `--unicodes` range.

## Social card fonts

`og/AxelSerif-Medium.ttf` and `og/Onest-Medium.ttf` are static instances (weight 500) of the two
files above, subset to printable ASCII plus a few punctuation marks. They exist only for
`src/app/opengraph-image.tsx`: the image renderer (Satori) reads TTF but not WOFF2 or variable
fonts. Same licenses as their sources. Made with `fontTools.varLib.instancer` and
`fontTools.subset` from the WOFF2 files in this folder.
