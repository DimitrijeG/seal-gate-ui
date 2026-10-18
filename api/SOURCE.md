# API contract

`openapi.yaml` is a copy of `api/openapi.yaml` from seal-gate at commit
`d6325aec2152889dd883389c37d024da79476f81` (feat: refuse duplicate unseal shares and expire the buffer).

To update it, copy the file from the seal-gate commit you deploy and change
the hash above in the same commit:

```sh
git -C ../seal-gate show <commit>:api/openapi.yaml > api/openapi.yaml
```
