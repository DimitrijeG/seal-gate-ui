# API contract

`openapi.yaml` is a copy of `api/openapi.yaml` from seal-gate at commit
`c58bac2d7e9d87d4a55c71c59d08c32af8e7e245` (docs: restructure the README for the thesis).

To update it, copy the file from the seal-gate commit you deploy and change
the hash above in the same commit:

```sh
git -C ../seal-gate show <commit>:api/openapi.yaml > api/openapi.yaml
```
