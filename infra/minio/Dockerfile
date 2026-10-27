# Community images are no longer available in the original registries.
# Build the official upstream source at a fixed revision instead of using a mirror.
FROM golang:1.26-alpine@sha256:a2012b4a1d1f9f7e9f44e0d39b805a901e856b1dd80b4e6ee4338db547050308 AS build
ARG MINIO_REVISION=7aac2a2c5b7c882e68c1ce017d8256be2feea27f
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/minio/minio@${MINIO_REVISION}

FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
RUN apk add --no-cache ca-certificates curl \
    && addgroup -S minio && adduser -S -G minio minio \
    && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
ADD https://raw.githubusercontent.com/minio/minio/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/LICENSE /usr/share/licenses/minio/LICENSE
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
