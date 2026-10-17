from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Supplier(TimeStampedModel):
    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(max_length=30, unique=True, help_text="Short unique supplier code, e.g. SUP-001")
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    gst_number = models.CharField("Tax / GST number", max_length=50, blank=True)
    lead_time_days = models.PositiveIntegerField(default=7, help_text="Typical delivery lead time")
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0, help_text="0.0 - 5.0")
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} - {self.name}"
