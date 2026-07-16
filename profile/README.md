# Home Assistant parcel integrations

A suite of [Home Assistant](https://www.home-assistant.io/) custom integrations that track your parcels across carriers — every one speaking the same canonical parcel contract, so your automations and dashboards work the same no matter who delivers.

## Integrations

| | Integration | Tracks |
|---|---|---|
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-dhl-nl/main/custom_components/dhl_nl/brand/icon.png" width="32" alt="DHL"> | [ha-dhl-nl](https://github.com/ha-parcel-integrations/ha-dhl-nl) | DHL eCommerce NL — incoming & outgoing parcels |
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-postnl/main/custom_components/postnl/brand/icon.png" width="32" alt="PostNL"> | [ha-postnl](https://github.com/ha-parcel-integrations/ha-postnl) | PostNL — parcels & announced MyMail letters |
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-dpd/main/custom_components/dpd/brand/icon.png" width="32" alt="DPD"> | [ha-dpd](https://github.com/ha-parcel-integrations/ha-dpd) | DPD shipments |
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-gls/main/custom_components/gls/brand/icon.png" width="32" alt="GLS"> | [ha-gls](https://github.com/ha-parcel-integrations/ha-gls) | GLS — account-less, tracking number + postcode |
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-dragonfly/main/custom_components/dragonfly/brand/icon.png" width="32" alt="Dragonfly"> | [ha-dragonfly](https://github.com/ha-parcel-integrations/ha-dragonfly) | Dragonfly Shipping — account-less, tracking number only |
| <img src="https://raw.githubusercontent.com/ha-parcel-integrations/ha-parcel-aggregator/main/custom_components/parcel_aggregator/brand/icon.png" width="32" alt="Parcel Aggregator"> | [ha-parcel-aggregator](https://github.com/ha-parcel-integrations/ha-parcel-aggregator) | Rolls every carrier above into one unified set of sensors and a single event stream |

## How they fit together

Each carrier integration normalises its data to a shared `ParcelStatus` enum and a common parcel shape, and fires canonical events (`<carrier>_parcel_registered` / `_status_changed` / `_delivery_time_changed`). The **Parcel Aggregator** subscribes to all of them and re-emits a unified stream — so you write one automation like *"when any parcel is out for delivery"* instead of one per carrier.

## Installation

All integrations are distributed via [HACS](https://hacs.xyz/). See each repository's README for setup and configuration.

## Community

💬 Questions or feedback? Join the discussion on the [Home Assistant community](https://community.home-assistant.io/t/packages-postnl-dhl-nl-dpd-and-gls-parcel-integration/112433/).
