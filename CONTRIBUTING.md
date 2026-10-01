# Contributing

The following outlines a set of guidelines for contributing to this project. These are mostly guidelines, not rules. Use your best judgement, and feel free to propose changes to this document in a pull request.

## Asking questions

Prefer asking questions in the [PostCSS chat](https://gitter.im/postcss/postcss) over opening issues.
Leveraging the community would likely get you an answer faster, as well as leave us available to solve issues and make the product better.

## Reporting Bugs

Before submitting a new issue, be sure to make a cursory search to see if the problem has already been reported. If it has and the issue is still open, leave a comment on the existing issue instead of opening a new one.

If no prior issue exist, create a new one. Explain the problem and include additional details to help maintainers reproduce the problem:

- Use a clear and descriptive title.
- Summarize the problem you are having.
- Include details about your configuration and environment.
- Provide steps to reproduce the problem.
- Describe what behavior you expected to see.

## Requesting Enhancements

Before submitting a new issue, be sure to make a cursory search to see if the enhancement has already been requested. If no such issue exists, create a new one and detail it to the best of your ability:

- Use a clear and descriptive title.
- Provide a description of the proposed enhancement.
- Exemplify what needs/uses this enhancement would address.

## Submitting Pull Requests

Before contributing any code to the project, be sure to either open a new issue in the issue tracker detailing what you intend to contribute, or comment on an existing issue if one exists.
This allows us to:

- give feedback early on before significant effort has been put into the endeavour.
- align your contribution with ongoing efforts.
- make sure that there's no ongoing effort into the issue already.

When submitting your pull request, make sure that you:

- use a clear and descriptive title.
- summarize your contribution.
- list the issues that this contribution addresses.
- include tests for your contribution.

## Development

The project uses [pnpm](https://pnpm.io/) and ES modules. Before submitting a
pull request, run:

```sh
pnpm install
pnpm test
pnpm lint
```

`pnpm lint` runs oxlint, `tsc`, and `oxfmt --check`; `pnpm fmt` formats the
code. If your change touches parsing, analysis, or simplification, also run the
full differential corpus with `pnpm test:corpus:full`.

## Benchmarks and Performance

If your pull request touches hot parsing, analysis, simplification, or
serialization paths, run the relevant benchmarks. The paired parser benchmarks
compare your working tree against a baseline revision (`HEAD` by default), so
commit or stash unrelated changes first; there is no need to run them twice by
hand.

Benchmark results are noisy estimates, not proof. Run them on an idle machine,
report the verdict together with the intervals and your environment, and treat
`inconclusive` as "unknown", not as "fine". Do not rerun until you get a
favorable verdict. See [BENCHMARKS.md](BENCHMARKS.md) for what each benchmark
does and does not measure, the methodology, and the controlled-run checklist.
