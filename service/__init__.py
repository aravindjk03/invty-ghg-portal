"""IINVTY Product Carbon service.

A FastAPI application that sits beside the Express API. It asks an AI model to
decompose a product into lifecycle lines, then hands those lines to ghg_core,
which computes every total. See docs/product-carbon-and-mitigation-spec.md §15.
"""
