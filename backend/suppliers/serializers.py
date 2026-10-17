from rest_framework import serializers

from .models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)
    open_po_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "code", "contact_person", "email", "phone", "address", "city", "country",
            "gst_number", "lead_time_days", "rating", "is_active", "notes",
            "item_count", "open_po_count", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_rating(self, value):
        if value < 0 or value > 5:
            raise serializers.ValidationError("Rating must be between 0 and 5.")
        return value
